const NotificationProvider = require("./notification-provider");
const axios = require("axios");
const { UP, DOWN } = require("../../src/util");
const { R } = require("redbean-node");
const { log } = require("../../src/util");

class HaloPSA extends NotificationProvider {
    name = "HaloPSA";

    // Cache for OAuth tokens (in-memory, expires after token lifetime)
    static tokenCache = new Map();

    /**
     * Get OAuth2 access token for HaloPSA API
     * @param {object} notification Notification configuration
     * @returns {Promise<string>} Access token
     */
    async getAccessToken(notification) {
        const cacheKey = `${notification.haloTenantUrl}_${notification.haloClientId}`;
        const cached = HaloPSA.tokenCache.get(cacheKey);

        // Check if cached token is still valid (with 5 minute buffer)
        if (cached && cached.expiresAt > Date.now() + 300000) {
            return cached.token;
        }

        // Request new token
        const tokenUrl = `${notification.haloTenantUrl}/auth/token`;
        const params = new URLSearchParams({
            grant_type: "client_credentials",
            client_id: notification.haloClientId,
            client_secret: notification.haloClientSecret,
            scope: notification.haloScope || "all"
        });

        try {
            const response = await axios.post(tokenUrl, params, {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            });

            const token = response.data.access_token;
            const expiresIn = response.data.expires_in || 3600; // Default 1 hour

            // Cache the token
            HaloPSA.tokenCache.set(cacheKey, {
                token: token,
                expiresAt: Date.now() + (expiresIn * 1000)
            });

            return token;
        } catch (error) {
            throw new Error(`HaloPSA authentication failed: ${error.message}`);
        }
    }

    /**
     * Get HaloPSA client ID from monitor tags or use default
     * @param {object} monitorJSON Monitor configuration
     * @param {object} notification Notification configuration
     * @returns {Promise<number|null>} HaloPSA client ID or null if not found
     */
    async getClientId(monitorJSON, notification) {
        if (!monitorJSON || !monitorJSON.id) {
            return notification.haloDefaultClientId || null;
        }

        const tagName = notification.haloTagName || "HaloClient";

        try {
            const tags = await R.getAll(
                `SELECT mt.value FROM monitor_tag mt
                 JOIN tag ON mt.tag_id = tag.id
                 WHERE mt.monitor_id = ? AND tag.name = ?`,
                [ monitorJSON.id, tagName ]
            );

            if (tags && tags.length > 0 && tags[0].value) {
                return parseInt(tags[0].value);
            }
        } catch (error) {
            log.error("halopsa", `Error fetching client ID from tags: ${error.message}`);
        }

        // Fallback to default client ID (may be null/undefined)
        return notification.haloDefaultClientId || null;
    }

    /**
     * Find existing HaloPSA ticket for this monitor
     * @param {number} monitorId Monitor ID
     * @param {object} notification Notification configuration
     * @returns {Promise<object|null>} Ticket mapping or null
     */
    async findTicket(monitorId, notification) {
        try {
            // Use notification type + tenant URL as a unique key since we can't access notification.id
            // This works because each HaloPSA instance will have a unique tenant URL
            const mapping = await R.findOne("halopsa_ticket_mapping",
                "monitor_id = ? AND tenant_url = ?",
                [ monitorId, notification.haloTenantUrl ]
            );
            return mapping;
        } catch (error) {
            log.error("halopsa", `Error finding ticket mapping: ${error.message}`);
            return null;
        }
    }

    /**
     * Store ticket mapping in database
     * @param {number} monitorId Monitor ID
     * @param {object} notification Notification configuration
     * @param {number} ticketId HaloPSA ticket ID
     * @returns {Promise<void>}
     */
    async storeTicket(monitorId, notification, ticketId) {
        try {
            const bean = R.dispense("halopsa_ticket_mapping");
            bean.monitor_id = monitorId;
            bean.tenant_url = notification.haloTenantUrl;
            bean.ticket_id = ticketId;
            await R.store(bean);
        } catch (error) {
            log.error("halopsa", `Error storing ticket mapping: ${error.message}`);
        }
    }

    /**
     * Delete ticket mapping from database
     * @param {number} monitorId Monitor ID
     * @param {object} notification Notification configuration
     * @returns {Promise<void>}
     */
    async deleteTicket(monitorId, notification) {
        try {
            await R.exec(
                "DELETE FROM halopsa_ticket_mapping WHERE monitor_id = ? AND tenant_url = ?",
                [ monitorId, notification.haloTenantUrl ]
            );
        } catch (error) {
            log.error("halopsa", `Error deleting ticket mapping: ${error.message}`);
        }
    }

    /**
     * Create a new ticket in HaloPSA
     * @param {object} notification Notification configuration
     * @param {object} monitorJSON Monitor details
     * @param {object} heartbeatJSON Heartbeat details
     * @returns {Promise<string>} Success message
     */
    async createTicket(notification, monitorJSON, heartbeatJSON) {
        const token = await this.getAccessToken(notification);
        const clientId = await this.getClientId(monitorJSON, notification);

        if (!clientId) {
            throw new Error(`HaloPSA: No client ID found for monitor "${monitorJSON.name}". Please tag the monitor with "${notification.haloTagName || "HaloClient"}" or set a default client ID in the notification settings.`);
        }

        const apiUrl = `${notification.haloTenantUrl}/api/tickets`;

        // Build the ticket object
        const ticket = {
            tickettype_id: notification.haloTicketTypeId || 1,
            client_id: clientId,
            summary: `[Uptime Kuma] ${monitorJSON.name} is DOWN`,
            details: this.buildTicketDetails(monitorJSON, heartbeatJSON, "DOWN"),
            priority_id: notification.haloPriorityId || 2,
            status_id: notification.haloStatusIdOpen || 1,
        };

        // Add optional site_id if configured
        if (notification.haloSiteId) {
            ticket.site_id = notification.haloSiteId;
        }

        // Add optional category if configured
        if (notification.haloCategory1) {
            ticket.category_1 = notification.haloCategory1;
        }
        if (notification.haloCategory2) {
            ticket.category_2 = notification.haloCategory2;
        }

        // HaloPSA API expects an array of tickets
        const ticketPayload = [ticket];

        try {
            const response = await axios.post(apiUrl, ticketPayload, {
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });

            // HaloPSA can return either an array or a single object
            let ticket;
            if (Array.isArray(response.data) && response.data.length > 0) {
                ticket = response.data[0];
            } else if (response.data && typeof response.data === "object") {
                ticket = response.data;
            }

            if (ticket) {
                // HaloPSA may use 'id', 'ticket_id', or 'ticketId'
                const ticketId = ticket.id || ticket.ticket_id || ticket.ticketId;

                if (ticketId) {
                    // Store the ticket mapping for later closure
                    await this.storeTicket(monitorJSON.id, notification, ticketId);

                    return `HaloPSA ticket created successfully: #${ticketId}`;
                } else {
                    log.error("halopsa", `HaloPSA API response missing ticket ID. Response: ${JSON.stringify(response.data)}`);
                    throw new Error("HaloPSA API did not return a ticket ID");
                }
            } else {
                log.error("halopsa", `Unexpected HaloPSA API response format. Response: ${JSON.stringify(response.data)}`);
                throw new Error("HaloPSA API did not return a ticket ID");
            }
        } catch (error) {
            if (error.response) {
                throw new Error(`HaloPSA ticket creation failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    /**
     * Update an existing ticket in HaloPSA (for adding notes on continued downtime)
     * @param {object} notification Notification configuration
     * @param {number} ticketId HaloPSA ticket ID
     * @param {object} monitorJSON Monitor details
     * @param {object} heartbeatJSON Heartbeat details
     * @returns {Promise<string>} Success message
     */
    async updateTicket(notification, ticketId, monitorJSON, heartbeatJSON) {
        const token = await this.getAccessToken(notification);
        const apiUrl = `${notification.haloTenantUrl}/api/tickets/${ticketId}`;

        // Update the specific ticket
        const updatePayload = {
            id: ticketId,
            // Add a note about continued downtime
            note: `Monitor still DOWN at ${new Date().toISOString()}\nError: ${heartbeatJSON.msg || "Unknown error"}`
        };

        try {
            await axios.post(apiUrl, updatePayload, {
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });

            return `HaloPSA ticket #${ticketId} updated with continued downtime note`;
        } catch (error) {
            log.error("halopsa", `Failed to update ticket #${ticketId}: ${error.message}`);
            return "Failed to update HaloPSA ticket";
        }
    }

    /**
     * Close a ticket in HaloPSA
     * @param {object} notification Notification configuration
     * @param {number} ticketId HaloPSA ticket ID
     * @param {object} monitorJSON Monitor details
     * @returns {Promise<string>} Success message
     */
    async closeTicket(notification, ticketId, monitorJSON) {
        const token = await this.getAccessToken(notification);
        const apiUrl = `${notification.haloTenantUrl}/api/tickets/${ticketId}`;

        // Update the ticket to close it
        const closePayload = {
            id: ticketId,
            status_id: notification.haloStatusIdClosed || 9,
            note: `Monitor recovered and is now UP. Auto-closed by Uptime Kuma at ${new Date().toISOString()}`
        };

        try {
            await axios.post(apiUrl, closePayload, {
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });

            // Delete the ticket mapping since it's now closed
            await this.deleteTicket(monitorJSON.id, notification);

            return `HaloPSA ticket #${ticketId} closed successfully`;
        } catch (error) {
            if (error.response) {
                throw new Error(`HaloPSA ticket closure failed: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    /**
     * Build detailed ticket description
     * @param {object} monitorJSON Monitor details
     * @param {object} heartbeatJSON Heartbeat details
     * @param {string} status Status (UP/DOWN)
     * @returns {string} Formatted ticket details
     */
    buildTicketDetails(monitorJSON, heartbeatJSON, status) {
        const lines = [
            `Monitor: ${monitorJSON.name}`,
            `Status: ${status}`,
            `Type: ${monitorJSON.type}`,
            ""
        ];

        if (monitorJSON.url) {
            lines.push(`URL: ${monitorJSON.url}`);
        }
        if (monitorJSON.hostname) {
            lines.push(`Hostname: ${monitorJSON.hostname}`);
        }
        if (monitorJSON.port) {
            lines.push(`Port: ${monitorJSON.port}`);
        }

        if (heartbeatJSON) {
            lines.push("");
            lines.push(`Time: ${heartbeatJSON.localDateTime || new Date().toISOString()}`);

            if (heartbeatJSON.msg) {
                lines.push(`Error: ${heartbeatJSON.msg}`);
            }

            if (heartbeatJSON.ping) {
                lines.push(`Response Time: ${heartbeatJSON.ping}ms`);
            }
        }

        lines.push("");
        lines.push("This ticket was automatically created by Uptime Kuma.");

        return lines.join("\n");
    }

    /**
     * @inheritdoc
     */
    async send(notification, msg, monitorJSON = null, heartbeatJSON = null) {
        try {
            // Validate required configuration
            if (!notification.haloTenantUrl) {
                throw new Error("HaloPSA Tenant URL is required");
            }
            if (!notification.haloClientId) {
                throw new Error("HaloPSA Client ID is required");
            }
            if (!notification.haloClientSecret) {
                throw new Error("HaloPSA Client Secret is required");
            }

            // Handle test notification
            if (heartbeatJSON == null) {
                const token = await this.getAccessToken(notification);
                return `HaloPSA authentication successful. Token obtained. Ready to create tickets.`;
            }

            // Handle DOWN status - create or update ticket
            if (heartbeatJSON.status === DOWN) {
                const existingTicket = await this.findTicket(monitorJSON.id, notification);

                if (existingTicket) {
                    // Ticket already exists, add a note
                    return await this.updateTicket(
                        notification,
                        existingTicket.ticket_id,
                        monitorJSON,
                        heartbeatJSON
                    );
                } else {
                    // Create new ticket
                    return await this.createTicket(notification, monitorJSON, heartbeatJSON);
                }
            }

            // Handle UP status - close ticket if auto-resolve is enabled
            if (heartbeatJSON.status === UP) {
                if (!notification.haloAutoResolve) {
                    return "Monitor is UP but auto-resolve is disabled";
                }

                const existingTicket = await this.findTicket(monitorJSON.id, notification);

                if (existingTicket) {
                    return await this.closeTicket(
                        notification,
                        existingTicket.ticket_id,
                        monitorJSON
                    );
                } else {
                    return "Monitor is UP, no open ticket found";
                }
            }

            return "HaloPSA notification processed";
        } catch (error) {
            this.throwGeneralAxiosError(error);
        }
    }
}

module.exports = HaloPSA;
