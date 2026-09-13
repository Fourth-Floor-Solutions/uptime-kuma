const NotificationProvider = require("./notification-provider");
const axios = require("axios");
const { R } = require("redbean-node");
const { UP, DOWN, log } = require("../../src/util");

/**
 * HaloPSA Tickets — opens a HaloPSA ticket when a monitor goes DOWN and
 * closes it again when the monitor recovers.
 *
 * Unlike the plain "HaloPSA" provider (which only POSTs a payload to a
 * webhook URL), this provider talks to the HaloPSA REST API directly:
 *   - OAuth2 client-credentials against {tenant}/auth/token
 *   - Client resolution from a monitor tag (numeric client id OR client name)
 *   - Ticket creation via POST /api/Tickets
 *   - Ticket closure via POST /api/Actions (outcome "Resolved")
 *   - A local mapping table (halopsa_ticket_mapping) remembers which
 *     ticket belongs to which monitor so recovery closes the right one.
 */
class HaloPSATickets extends NotificationProvider {
    name = "HaloPSATickets";

    /** OAuth token cache keyed by tenant+clientId. @type {Map<string, {token: string, expiresAt: number}>} */
    static tokenCache = new Map();

    /** Client name → id cache keyed by tenant. @type {Map<string, {map: Map<string, number>, loadedAt: number}>} */
    static clientCache = new Map();

    /** How long a client list stays cached (ms). */
    static CLIENT_CACHE_TTL = 60 * 60 * 1000;

    /**
     * Normalise the tenant URL (no trailing slash).
     * @param {object} notification Notification config
     * @returns {string} Tenant base URL
     */
    tenant(notification) {
        return String(notification.haloTenantUrl || "").trim().replace(/\/+$/, "");
    }

    /**
     * Obtain (or reuse) an OAuth2 access token.
     * @param {object} notification Notification config
     * @returns {Promise<string>} Bearer token
     */
    async getAccessToken(notification) {
        const tenant = this.tenant(notification);
        const cacheKey = `${tenant}|${notification.haloClientId}`;
        const cached = HaloPSATickets.tokenCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
            return cached.token;
        }

        const params = new URLSearchParams({
            grant_type: "client_credentials",
            client_id: notification.haloClientId,
            client_secret: notification.haloClientSecret,
            scope: notification.haloScope || "all",
        });

        const config = this.getAxiosConfigWithProxy({
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 20000,
        });

        const response = await axios.post(`${tenant}/auth/token`, params, config);
        const token = response.data.access_token;
        if (!token) {
            throw new Error("HaloPSA auth response did not include an access_token");
        }
        const expiresIn = Number(response.data.expires_in) || 3600;
        HaloPSATickets.tokenCache.set(cacheKey, { token, expiresAt: Date.now() + expiresIn * 1000 });
        return token;
    }

    /**
     * Authenticated request helper.
     * @param {object} notification Notification config
     * @param {string} method HTTP method
     * @param {string} path API path beginning with /api/
     * @param {?object} data Request body
     * @param {boolean} retry Retry once with a fresh token on 401/403
     * @returns {Promise<object>} Axios response
     */
    async api(notification, method, path, data = null, retry = true) {
        const token = await this.getAccessToken(notification);
        const config = this.getAxiosConfigWithProxy({
            method,
            url: `${this.tenant(notification)}${path}`,
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            timeout: 30000,
        });
        if (data !== null) {
            config.data = data;
        }
        try {
            return await axios(config);
        } catch (e) {
            const status = e.response && e.response.status;
            // HaloPSA encodes the agent's permissions in the token. If permissions were
            // changed after the token was cached, drop it and try once with a fresh one.
            if (retry && (status === 401 || status === 403)) {
                const cacheKey = `${this.tenant(notification)}|${notification.haloClientId}`;
                HaloPSATickets.tokenCache.delete(cacheKey);
                log.warn("halopsa-tickets", `HTTP ${status} on ${method} ${path}; retrying once with a fresh token`);
                return this.api(notification, method, path, data, false);
            }
            throw e;
        }
    }

    /**
     * Read the client-mapping tag value from the monitor.
     * Uses monitorJSON.tags when present, otherwise queries the database.
     * @param {object} monitorJSON Monitor details
     * @param {string} tagName Tag name to look for
     * @returns {Promise<?string>} Tag value or null
     */
    async getTagValue(monitorJSON, tagName) {
        let tags = Array.isArray(monitorJSON.tags) ? monitorJSON.tags : null;
        if (!tags && monitorJSON.id) {
            tags = await R.getAll(
                "SELECT mt.value, tag.name FROM monitor_tag mt JOIN tag ON mt.tag_id = tag.id WHERE mt.monitor_id = ?",
                [ monitorJSON.id ]
            );
        }
        const hit = (tags || []).find((t) => t && t.name === tagName && t.value !== undefined && t.value !== null && String(t.value).trim() !== "");
        return hit ? String(hit.value).trim() : null;
    }

    /**
     * Load (or reuse) the tenant's client list as a lower-case name → id map.
     * @param {object} notification Notification config
     * @param {boolean} force Bypass the cache
     * @returns {Promise<Map<string, number>>} name map
     */
    async loadClientMap(notification, force = false) {
        const tenant = this.tenant(notification);
        const cached = HaloPSATickets.clientCache.get(tenant);
        if (!force && cached && Date.now() - cached.loadedAt < HaloPSATickets.CLIENT_CACHE_TTL) {
            return cached.map;
        }
        const map = new Map();
        let page = 1;
        const pageSize = 500;
        // Halo paginates when pageinate=true; loop until a short page comes back.
        for (;;) {
            const res = await this.api(notification, "GET",
                `/api/Client?pageinate=true&page_size=${pageSize}&page_no=${page}&includeinactive=false&order=name`);
            const list = Array.isArray(res.data) ? res.data : (res.data.clients || []);
            for (const c of list) {
                if (c && c.name) {
                    map.set(String(c.name).trim().toLowerCase(), Number(c.id));
                }
            }
            if (list.length < pageSize || page >= 20) {
                break;
            }
            page++;
        }
        HaloPSATickets.clientCache.set(tenant, { map, loadedAt: Date.now() });
        return map;
    }

    /**
     * Resolve the HaloPSA client id for a monitor.
     * Tag value may be a numeric client id or the exact client name.
     * @param {object} notification Notification config
     * @param {object} monitorJSON Monitor details
     * @returns {Promise<number>} Client id
     */
    async resolveClientId(notification, monitorJSON) {
        const tagName = notification.haloTagName || "HaloClient";
        const value = await this.getTagValue(monitorJSON, tagName);

        if (value) {
            if (/^\d+$/.test(value)) {
                return parseInt(value, 10);
            }
            let map = await this.loadClientMap(notification);
            let id = map.get(value.toLowerCase());
            if (id === undefined) {
                // Client may have been created since the cache was filled.
                map = await this.loadClientMap(notification, true);
                id = map.get(value.toLowerCase());
            }
            if (id !== undefined) {
                return id;
            }
            if (notification.haloDefaultClientId) {
                log.warn("halopsa-tickets", `Tag "${tagName}"="${value}" on monitor "${monitorJSON.name}" matches no HaloPSA client; using default client ${notification.haloDefaultClientId}`);
                return Number(notification.haloDefaultClientId);
            }
            throw new Error(`HaloPSA client "${value}" (tag "${tagName}" on monitor "${monitorJSON.name}") was not found. Use the exact client name or the numeric client id.`);
        }

        if (notification.haloDefaultClientId) {
            return Number(notification.haloDefaultClientId);
        }
        throw new Error(`Monitor "${monitorJSON.name}" has no "${tagName}" tag and no default client id is configured.`);
    }

    /**
     * @param {number} monitorId Monitor id
     * @param {object} notification Notification config
     * @returns {Promise<?object>} Mapping row or null
     */
    async findMapping(monitorId, notification) {
        return R.findOne("halopsa_ticket_mapping", " monitor_id = ? AND tenant_url = ? ", [ monitorId, this.tenant(notification) ]);
    }

    /**
     * @param {number} monitorId Monitor id
     * @param {object} notification Notification config
     * @param {string|number} ticketId Halo ticket id
     * @returns {Promise<void>}
     */
    async storeMapping(monitorId, notification, ticketId) {
        await this.deleteMapping(monitorId, notification);
        const bean = R.dispense("halopsa_ticket_mapping");
        bean.monitor_id = monitorId;
        bean.tenant_url = this.tenant(notification);
        bean.ticket_id = String(ticketId);
        bean.created_at = R.isoDateTime();
        await R.store(bean);
    }

    /**
     * @param {number} monitorId Monitor id
     * @param {object} notification Notification config
     * @returns {Promise<void>}
     */
    async deleteMapping(monitorId, notification) {
        await R.exec("DELETE FROM halopsa_ticket_mapping WHERE monitor_id = ? AND tenant_url = ?", [ monitorId, this.tenant(notification) ]);
    }

    /**
     * Check whether a ticket is still open in HaloPSA.
     * @param {object} notification Notification config
     * @param {string|number} ticketId Halo ticket id
     * @returns {Promise<boolean>} true when open
     */
    async isTicketOpen(notification, ticketId) {
        try {
            const res = await this.api(notification, "GET", `/api/Tickets/${parseInt(ticketId, 10)}`);
            const closedId = Number(notification.haloStatusIdClosed || 9);
            return Number(res.data.status_id) !== closedId;
        } catch (e) {
            if (e.response && e.response.status === 404) {
                return false;
            }
            throw e;
        }
    }

    /**
     * Build the ticket body text.
     * @param {object} monitorJSON Monitor details
     * @param {object} heartbeatJSON Heartbeat details
     * @returns {string} details
     */
    buildDetails(monitorJSON, heartbeatJSON) {
        const lines = [
            `Monitor: ${monitorJSON.name}`,
            `Type: ${monitorJSON.type}`,
        ];
        const address = this.extractAddress(monitorJSON);
        if (address) {
            lines.push(`Target: ${address}`);
        }
        if (monitorJSON.pathName && monitorJSON.pathName !== monitorJSON.name) {
            lines.push(`Path: ${monitorJSON.pathName}`);
        }
        lines.push(`Error: ${heartbeatJSON.msg || "Unknown error"}`);
        lines.push(`Time: ${heartbeatJSON.localDateTime || heartbeatJSON.time || new Date().toISOString()}`);
        lines.push("");
        lines.push(`Monitor ID: ${monitorJSON.id}`);
        lines.push("");
        lines.push("This ticket was automatically created by Uptime Kuma.");
        return lines.join("\n");
    }

    /**
     * Create a ticket for a DOWN monitor.
     * @param {object} notification Notification config
     * @param {object} monitorJSON Monitor details
     * @param {object} heartbeatJSON Heartbeat details
     * @returns {Promise<string>} Result message
     */
    async createTicket(notification, monitorJSON, heartbeatJSON) {
        const clientId = await this.resolveClientId(notification, monitorJSON);
        const prefix = (notification.haloSummaryPrefix || "[MONITOR DOWN]").trim();

        const ticket = {
            tickettype_id: Number(notification.haloTicketTypeId || 1),
            client_id: clientId,
            summary: `${prefix} ${monitorJSON.name}`.trim(),
            details: this.buildDetails(monitorJSON, heartbeatJSON),
            priority_id: Number(notification.haloPriorityId || 2),
            status_id: Number(notification.haloStatusIdOpen || 1),
        };
        if (notification.haloSiteId) {
            ticket.site_id = Number(notification.haloSiteId);
        }
        if (notification.haloCategory1) {
            ticket.category_1 = notification.haloCategory1;
        }
        if (notification.haloCategory2) {
            ticket.category_2 = notification.haloCategory2;
        }
        if (notification.haloMonitorIdFieldId) {
            ticket.customfields = [ { id: Number(notification.haloMonitorIdFieldId), value: String(monitorJSON.id) } ];
        }

        const res = await this.api(notification, "POST", "/api/Tickets", [ ticket ]);
        const created = Array.isArray(res.data) ? res.data[0] : res.data;
        const rawId = created && (created.id ?? created.ticket_id ?? created.ticketId);
        if (rawId === undefined || rawId === null) {
            throw new Error(`HaloPSA did not return a ticket id: ${JSON.stringify(res.data).slice(0, 300)}`);
        }
        await this.storeMapping(monitorJSON.id, notification, rawId);
        log.info("halopsa-tickets", `Opened HaloPSA ticket ${rawId} for monitor ${monitorJSON.id} (${monitorJSON.name}), client ${clientId}`);
        return `HaloPSA ticket #${rawId} opened for client ${clientId}`;
    }

    /**
     * Add a private note to an existing ticket (repeat DOWN notification).
     * Failure here is non-fatal.
     * @param {object} notification Notification config
     * @param {string|number} ticketId Halo ticket id
     * @param {object} monitorJSON Monitor details
     * @param {object} heartbeatJSON Heartbeat details
     * @returns {Promise<string>} Result message
     */
    async addStillDownNote(notification, ticketId, monitorJSON, heartbeatJSON) {
        const text = `Monitor ${monitorJSON.name} reported DOWN at ${heartbeatJSON.localDateTime || new Date().toISOString()} (ticket already open).<br>Error: ${heartbeatJSON.msg || "Unknown error"}`;
        try {
            await this.addNote(notification, ticketId, text, true);
            return `HaloPSA ticket #${ticketId} still open; DOWN note added`;
        } catch (e) {
            log.warn("halopsa-tickets", `Could not add note to ticket ${ticketId}: ${e.message}`);
            return `HaloPSA ticket #${ticketId} still open (note failed: ${e.message})`;
        }
    }

    /**
     * Add a note action to a ticket without changing its status.
     * @param {object} notification Notification config
     * @param {string|number} ticketId Halo ticket id
     * @param {string} html Note body (HTML)
     * @param {boolean} hidden Hide from the end user
     * @returns {Promise<void>}
     */
    async addNote(notification, ticketId, html, hidden) {
        // HaloPSA rejects actions without an outcome ("An Outcome must be entered for this Action").
        await this.api(notification, "POST", "/api/Actions", [ {
            ticket_id: parseInt(ticketId, 10),
            outcome: notification.haloNoteOutcome || "Private Note",
            note_html: html,
            hiddenfromuser: hidden,
            who: "Uptime Kuma",
        } ]);
    }

    /**
     * Decide whether a person (or anything other than this integration) has
     * worked the ticket since it was opened.
     *
     * Rules:
     *  - every action whose "actionby_application_id" differs from the one that
     *    opened the ticket, and whose agent differs from the opening agent,
     *    counts as foreign (engineer notes, status changes, assignments, e-mails);
     *  - a ticket status that is neither the configured open nor closed status
     *    also counts (someone moved it to In Progress or similar).
     * @param {object} notification Notification config
     * @param {string|number} ticketId Halo ticket id
     * @returns {Promise<{actioned: boolean, reason: string}>} verdict
     */
    async wasActionedByOthers(notification, ticketId) {
        const id = parseInt(ticketId, 10);
        const openId = Number(notification.haloStatusIdOpen || 1);
        const closedId = Number(notification.haloStatusIdClosed || 9);

        const ticketRes = await this.api(notification, "GET", `/api/Tickets/${id}`);
        const status = Number(ticketRes.data.status_id);
        if (status !== openId && status !== closedId) {
            return { actioned: true, reason: `status is ${status}, not the open status ${openId}` };
        }

        const res = await this.api(notification, "GET", `/api/Actions?ticket_id=${id}&count=500&includehtmlnote=false`);
        const actions = Array.isArray(res.data) ? res.data : (res.data.actions || []);
        if (actions.length === 0) {
            return { actioned: false, reason: "no actions" };
        }

        const opening = actions.find((a) => String(a.outcome || "").toLowerCase() === "opened")
            || actions.reduce((min, a) => (Number(a.id) < Number(min.id) ? a : min), actions[0]);
        const ownApp = String(opening.actionby_application_id || "");
        const ownAgent = String(opening.who_agentid ?? "");

        for (const a of actions) {
            if (Number(a.id) === Number(opening.id)) {
                continue;
            }
            const app = String(a.actionby_application_id || "");
            const agent = String(a.who_agentid ?? "");
            const sameApp = ownApp !== "" && app === ownApp;
            const sameAgent = ownAgent !== "" && agent === ownAgent;
            if (sameApp || (app === "" && sameAgent && String(a.who || "") === "Uptime Kuma")) {
                continue; // our own note / status action
            }
            const by = a.who || (agent ? `agent ${agent}` : "unknown");
            return { actioned: true, reason: `action #${a.id} "${a.outcome || "note"}" by ${by}` };
        }
        return { actioned: false, reason: `${actions.length} action(s), all by this integration` };
    }

    /**
     * Close a ticket after the monitor recovers.
     * @param {object} notification Notification config
     * @param {string|number} ticketId Halo ticket id
     * @param {object} monitorJSON Monitor details
     * @param {object} heartbeatJSON Heartbeat details
     * @returns {Promise<string>} Result message
     */
    async closeTicket(notification, ticketId, monitorJSON, heartbeatJSON) {
        const when = heartbeatJSON.localDateTime || new Date().toISOString();
        const ping = heartbeatJSON.ping ? `${heartbeatJSON.ping}ms` : "n/a";
        const note = `Monitor ${monitorJSON.name} is back UP at ${when}.<br>Response time: ${ping}<br><br>This ticket was automatically closed by Uptime Kuma.`;

        const closedId = Number(notification.haloStatusIdClosed || 9);
        const id = parseInt(ticketId, 10);

        // 1. Resolution note (visible action on the ticket)
        await this.api(notification, "POST", "/api/Actions", [ {
            ticket_id: id,
            outcome: notification.haloCloseOutcome || "Resolved",
            status_id: closedId,
            closure_note: note,
            note_html: note,
            who: "Uptime Kuma",
            hiddenfromuser: false,
        } ]);

        // 2. The action alone does not move the status in HaloPSA; update the ticket itself.
        await this.api(notification, "POST", "/api/Tickets", [ {
            id: id,
            status_id: closedId,
            closeddate: new Date().toISOString(),
        } ]);

        await this.deleteMapping(monitorJSON.id, notification);
        log.info("halopsa-tickets", `Closed HaloPSA ticket ${ticketId} for monitor ${monitorJSON.id} (${monitorJSON.name})`);
        return `HaloPSA ticket #${ticketId} closed`;
    }

    /**
     * @inheritdoc
     */
    async send(notification, msg, monitorJSON = null, heartbeatJSON = null) {
        try {
            for (const key of [ "haloTenantUrl", "haloClientId", "haloClientSecret" ]) {
                if (!notification[key]) {
                    throw new Error(`HaloPSA Tickets: "${key}" is required`);
                }
            }

            // "Test" button from the notification dialog
            if (heartbeatJSON == null) {
                await this.getAccessToken(notification);
                const map = await this.loadClientMap(notification, true);
                let extra = "";
                if (notification.haloDefaultClientId) {
                    const known = [ ...map.values() ].includes(Number(notification.haloDefaultClientId));
                    extra = known ? ` Default client ${notification.haloDefaultClientId} found.` : ` WARNING: default client ${notification.haloDefaultClientId} not found among active clients.`;
                }
                return `HaloPSA authentication OK; ${map.size} active clients visible.${extra}`;
            }

            // Certificate-expiry and other monitor-less notifications are not ticketed here.
            if (monitorJSON == null) {
                return "HaloPSA Tickets: no monitor context, nothing to do";
            }

            if (heartbeatJSON.status === DOWN) {
                const mapping = await this.findMapping(monitorJSON.id, notification);
                if (mapping) {
                    if (await this.isTicketOpen(notification, mapping.ticket_id)) {
                        return this.addStillDownNote(notification, mapping.ticket_id, monitorJSON, heartbeatJSON);
                    }
                    // Ticket was closed by hand in Halo — forget it and open a new one.
                    await this.deleteMapping(monitorJSON.id, notification);
                }
                return this.createTicket(notification, monitorJSON, heartbeatJSON);
            }

            if (heartbeatJSON.status === UP) {
                if (notification.haloAutoResolve === false) {
                    return "Monitor is UP; auto-resolve disabled, ticket left open";
                }
                const mapping = await this.findMapping(monitorJSON.id, notification);
                if (!mapping) {
                    return "Monitor is UP; no open HaloPSA ticket recorded for it";
                }
                if (!(await this.isTicketOpen(notification, mapping.ticket_id))) {
                    await this.deleteMapping(monitorJSON.id, notification);
                    return `HaloPSA ticket #${mapping.ticket_id} was already closed`;
                }
                if (notification.haloKeepIfActioned !== false) {
                    const verdict = await this.wasActionedByOthers(notification, mapping.ticket_id);
                    if (verdict.actioned) {
                        const when = heartbeatJSON.localDateTime || new Date().toISOString();
                        const note = `Monitor ${monitorJSON.name} is back UP at ${when}.<br>Ticket left open because it has been actioned (${verdict.reason}).`;
                        await this.addNote(notification, mapping.ticket_id, note, false);
                        log.info("halopsa-tickets", `Ticket ${mapping.ticket_id} left open for monitor ${monitorJSON.id}: ${verdict.reason}`);
                        return `HaloPSA ticket #${mapping.ticket_id} left open (${verdict.reason}); UP note added`;
                    }
                }
                return this.closeTicket(notification, mapping.ticket_id, monitorJSON, heartbeatJSON);
            }

            return "HaloPSA Tickets: heartbeat status not UP/DOWN, ignored";
        } catch (error) {
            this.throwGeneralAxiosError(error);
        }
    }
}

module.exports = HaloPSATickets;
