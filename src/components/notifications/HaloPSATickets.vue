<template>
    <div class="mb-3">
        <label for="halot-tenant-url" class="form-label">HaloPSA Tenant URL</label>
        <input id="halot-tenant-url" v-model="$parent.notification.haloTenantUrl" type="url" class="form-control" placeholder="https://yourcompany.halopsa.com" required autocomplete="off">
    </div>

    <div class="mb-3">
        <label for="halot-client-id" class="form-label">API Client ID</label>
        <input id="halot-client-id" v-model="$parent.notification.haloClientId" type="text" class="form-control" required autocomplete="off">
        <div class="form-text">
            HaloPSA &gt; Configuration &gt; Integrations &gt; HaloPSA API &gt; Applications. Authentication method "Client ID and Secret (Services)", permissions "all" (or at least read/edit tickets and read clients).
        </div>
    </div>

    <div class="mb-3">
        <label for="halot-client-secret" class="form-label">API Client Secret</label>
        <HiddenInput id="halot-client-secret" v-model="$parent.notification.haloClientSecret" :required="true" autocomplete="new-password" />
    </div>

    <div class="mb-3">
        <label for="halot-scope" class="form-label">API Scope</label>
        <input id="halot-scope" v-model="$parent.notification.haloScope" type="text" class="form-control" placeholder="all" autocomplete="off">
    </div>

    <h5 class="mt-4 mb-3">Client mapping</h5>

    <div class="mb-3">
        <label for="halot-tag-name" class="form-label">Client Tag Name</label>
        <input id="halot-tag-name" v-model="$parent.notification.haloTagName" type="text" class="form-control" placeholder="HaloClient">
        <div class="form-text">
            Each monitor should carry this tag. The tag value can be the HaloPSA client's numeric ID or its exact client name (case-insensitive).
        </div>
    </div>

    <div class="mb-3">
        <label for="halot-default-client" class="form-label">Default Client ID (optional)</label>
        <input id="halot-default-client" v-model.number="$parent.notification.haloDefaultClientId" type="number" class="form-control" min="1">
        <div class="form-text">
            Used when a monitor has no client tag or the tag matches no client. Leave empty to fail instead (the error shows in the monitor's event log).
        </div>
    </div>

    <h5 class="mt-4 mb-3">Ticket settings</h5>

    <div class="row">
        <div class="col-md-6 mb-3">
            <label for="halot-ticket-type" class="form-label">Ticket Type ID</label>
            <input id="halot-ticket-type" v-model.number="$parent.notification.haloTicketTypeId" type="number" class="form-control" min="1">
        </div>
        <div class="col-md-6 mb-3">
            <label for="halot-priority" class="form-label">Priority ID</label>
            <input id="halot-priority" v-model.number="$parent.notification.haloPriorityId" type="number" class="form-control" min="1">
        </div>
        <div class="col-md-6 mb-3">
            <label for="halot-status-open" class="form-label">Status ID (open)</label>
            <input id="halot-status-open" v-model.number="$parent.notification.haloStatusIdOpen" type="number" class="form-control" min="1">
        </div>
        <div class="col-md-6 mb-3">
            <label for="halot-status-closed" class="form-label">Status ID (closed)</label>
            <input id="halot-status-closed" v-model.number="$parent.notification.haloStatusIdClosed" type="number" class="form-control" min="1">
        </div>
    </div>

    <div class="mb-3">
        <label for="halot-prefix" class="form-label">Summary prefix</label>
        <input id="halot-prefix" v-model="$parent.notification.haloSummaryPrefix" type="text" class="form-control" placeholder="[MONITOR DOWN]">
        <div class="form-text">Ticket summary becomes "&lt;prefix&gt; &lt;monitor name&gt;".</div>
    </div>

    <div class="mb-3">
        <label for="halot-monitor-field" class="form-label">Custom Field ID for Monitor ID (optional)</label>
        <input id="halot-monitor-field" v-model.number="$parent.notification.haloMonitorIdFieldId" type="number" class="form-control" min="1">
        <div class="form-text">If set, the Uptime Kuma monitor ID is written into this ticket custom field on creation.</div>
    </div>

    <div class="mb-3">
        <label for="halot-outcome" class="form-label">Closure outcome</label>
        <input id="halot-outcome" v-model="$parent.notification.haloCloseOutcome" type="text" class="form-control" placeholder="Resolved">
        <div class="form-text">Name of the HaloPSA action outcome used when closing (must exist in Halo, "Resolved" by default).</div>
    </div>

    <div class="mb-3">
        <div class="form-check form-switch">
            <input id="halot-auto-resolve" v-model="$parent.notification.haloAutoResolve" class="form-check-input" type="checkbox">
            <label class="form-check-label" for="halot-auto-resolve">Close the ticket automatically when the monitor recovers</label>
        </div>
    </div>

    <div class="mb-3">
        <div class="form-check form-switch">
            <input id="halot-keep-if-actioned" v-model="$parent.notification.haloKeepIfActioned" class="form-check-input" type="checkbox">
            <label class="form-check-label" for="halot-keep-if-actioned">Keep the ticket open if someone else has actioned it</label>
        </div>
        <div class="form-text">
            On recovery, the ticket's actions are checked. If anyone other than this integration has added a note, changed the status or otherwise worked the ticket, it is left open and a "service is back up" note is added instead of closing it. Tickets nobody touched are closed as normal.
        </div>
    </div>

    <div class="mb-3">
        <label for="halot-note-outcome" class="form-label">Note outcome</label>
        <input id="halot-note-outcome" v-model="$parent.notification.haloNoteOutcome" type="text" class="form-control" placeholder="Private Note">
        <div class="form-text">Outcome name used for informational notes ("back up", "down again"). HaloPSA requires an outcome on every action; "Private Note" exists by default.</div>
    </div>

    <h5 class="mt-4 mb-3">Optional ticket fields</h5>

    <div class="row">
        <div class="col-md-4 mb-3">
            <label for="halot-site" class="form-label">Site ID</label>
            <input id="halot-site" v-model.number="$parent.notification.haloSiteId" type="number" class="form-control" min="1">
        </div>
        <div class="col-md-4 mb-3">
            <label for="halot-cat1" class="form-label">Category 1</label>
            <input id="halot-cat1" v-model="$parent.notification.haloCategory1" type="text" class="form-control">
        </div>
        <div class="col-md-4 mb-3">
            <label for="halot-cat2" class="form-label">Category 2</label>
            <input id="halot-cat2" v-model="$parent.notification.haloCategory2" type="text" class="form-control">
        </div>
    </div>

    <div class="form-text">
        Use the <b>Test</b> button to verify the API credentials: it authenticates and lists how many active clients are visible. It does not create a ticket.
    </div>
</template>

<script>
import HiddenInput from "../HiddenInput.vue";

export default {
    components: {
        HiddenInput,
    },
    mounted() {
        const n = this.$parent.notification;
        const defaults = {
            haloScope: "all",
            haloTagName: "HaloClient",
            haloTicketTypeId: 1,
            haloPriorityId: 2,
            haloStatusIdOpen: 1,
            haloStatusIdClosed: 9,
            haloSummaryPrefix: "[MONITOR DOWN]",
            haloCloseOutcome: "Resolved",
            haloNoteOutcome: "Private Note",
            haloAutoResolve: true,
            haloKeepIfActioned: true,
        };
        for (const [ key, value ] of Object.entries(defaults)) {
            if (typeof n[key] === "undefined") {
                n[key] = value;
            }
        }
    },
};
</script>
