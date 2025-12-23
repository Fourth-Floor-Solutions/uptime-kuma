<template>
    <div class="mb-3">
        <label for="halo-tenant-url" class="form-label">HaloPSA Tenant URL</label>
        <input
            id="halo-tenant-url"
            v-model="$parent.notification.haloTenantUrl"
            type="text"
            class="form-control"
            placeholder="https://yourcompany.halopsa.com"
            required
            autocomplete="off"
        >
        <div class="form-text">
            Your HaloPSA instance URL (e.g., https://yourcompany.halopsa.com)
        </div>
    </div>

    <div class="mb-3">
        <label for="halo-client-id" class="form-label">Client ID</label>
        <input
            id="halo-client-id"
            v-model="$parent.notification.haloClientId"
            type="text"
            class="form-control"
            required
            autocomplete="off"
        >
        <div class="form-text">
            API Application Client ID from HaloPSA (Configuration &gt; Integrations &gt; HaloPSA API)
        </div>
    </div>

    <div class="mb-3">
        <label for="halo-client-secret" class="form-label">Client Secret</label>
        <HiddenInput
            id="halo-client-secret"
            v-model="$parent.notification.haloClientSecret"
            :required="true"
            autocomplete="off"
        />
        <div class="form-text">
            API Application Client Secret (shown only once when created)
        </div>
    </div>

    <div class="mb-3">
        <label for="halo-scope" class="form-label">API Scope</label>
        <input
            id="halo-scope"
            v-model="$parent.notification.haloScope"
            type="text"
            class="form-control"
            placeholder="all"
            autocomplete="off"
        >
        <div class="form-text">
            API permissions scope (e.g., "edit:tickets read:tickets" or "all")
        </div>
    </div>

    <h5 class="mt-4 mb-3">Ticket Configuration</h5>

    <div class="mb-3">
        <label for="halo-default-client-id" class="form-label">Default Client ID (Optional)</label>
        <input
            id="halo-default-client-id"
            v-model.number="$parent.notification.haloDefaultClientId"
            type="number"
            class="form-control"
            min="1"
        >
        <div class="form-text">
            Optional: Default HaloPSA client ID for monitors without a client tag. Leave empty to require all monitors to have a "{{ $parent.notification.haloTagName || 'HaloClient' }}" tag.
        </div>
    </div>

    <div class="mb-3">
        <label for="halo-tag-name" class="form-label">Client Mapping Tag Name</label>
        <input
            id="halo-tag-name"
            v-model="$parent.notification.haloTagName"
            type="text"
            class="form-control"
            placeholder="HaloClient"
        >
        <div class="form-text">
            Tag name to use for mapping monitors to HaloPSA clients. Tag monitors with this name and set the value to the client ID.
        </div>
    </div>

    <div class="mb-3">
        <label for="halo-ticket-type-id" class="form-label">Ticket Type ID</label>
        <input
            id="halo-ticket-type-id"
            v-model.number="$parent.notification.haloTicketTypeId"
            type="number"
            class="form-control"
            min="1"
        >
        <div class="form-text">
            HaloPSA Ticket Type ID (find in HaloPSA configuration)
        </div>
    </div>

    <div class="mb-3">
        <label for="halo-priority-id" class="form-label">Priority ID</label>
        <input
            id="halo-priority-id"
            v-model.number="$parent.notification.haloPriorityId"
            type="number"
            class="form-control"
            min="1"
        >
        <div class="form-text">
            Priority level for created tickets (check HaloPSA lookup codes for valid values)
        </div>
    </div>

    <div class="mb-3">
        <label for="halo-status-id-open" class="form-label">Status ID (Open)</label>
        <input
            id="halo-status-id-open"
            v-model.number="$parent.notification.haloStatusIdOpen"
            type="number"
            class="form-control"
            min="1"
        >
        <div class="form-text">
            Status ID for newly created tickets (typically 1 for "Open")
        </div>
    </div>

    <div class="mb-3">
        <label for="halo-status-id-closed" class="form-label">Status ID (Closed)</label>
        <input
            id="halo-status-id-closed"
            v-model.number="$parent.notification.haloStatusIdClosed"
            type="number"
            class="form-control"
            min="1"
        >
        <div class="form-text">
            Status ID for closing resolved tickets (typically 9 for "Closed")
        </div>
    </div>

    <div class="mb-3">
        <label for="halo-auto-resolve" class="form-label">Auto Resolve</label>
        <div class="form-check form-switch">
            <input
                id="halo-auto-resolve"
                v-model="$parent.notification.haloAutoResolve"
                class="form-check-input"
                type="checkbox"
            >
            <label class="form-check-label" for="halo-auto-resolve">
                Automatically close tickets when monitor recovers
            </label>
        </div>
    </div>

    <h5 class="mt-4 mb-3">Optional Fields</h5>

    <div class="mb-3">
        <label for="halo-site-id" class="form-label">Site ID (Optional)</label>
        <input
            id="halo-site-id"
            v-model.number="$parent.notification.haloSiteId"
            type="number"
            class="form-control"
            min="1"
        >
        <div class="form-text">
            Optional: HaloPSA Site ID to associate with tickets
        </div>
    </div>

    <div class="mb-3">
        <label for="halo-category-1" class="form-label">Category 1 (Optional)</label>
        <input
            id="halo-category-1"
            v-model="$parent.notification.haloCategory1"
            type="text"
            class="form-control"
        >
        <div class="form-text">
            Optional: Primary category for tickets
        </div>
    </div>

    <div class="mb-3">
        <label for="halo-category-2" class="form-label">Category 2 (Optional)</label>
        <input
            id="halo-category-2"
            v-model="$parent.notification.haloCategory2"
            type="text"
            class="form-control"
        >
        <div class="form-text">
            Optional: Secondary category for tickets
        </div>
    </div>
</template>

<script>
import HiddenInput from "../HiddenInput.vue";

export default {
    components: {
        HiddenInput,
    },
    mounted() {
        // Set default values
        if (typeof this.$parent.notification.haloTagName === "undefined") {
            this.$parent.notification.haloTagName = "HaloClient";
        }
        if (typeof this.$parent.notification.haloScope === "undefined") {
            this.$parent.notification.haloScope = "all";
        }
        if (typeof this.$parent.notification.haloTicketTypeId === "undefined") {
            this.$parent.notification.haloTicketTypeId = 1;
        }
        if (typeof this.$parent.notification.haloPriorityId === "undefined") {
            this.$parent.notification.haloPriorityId = 2;
        }
        if (typeof this.$parent.notification.haloStatusIdOpen === "undefined") {
            this.$parent.notification.haloStatusIdOpen = 1;
        }
        if (typeof this.$parent.notification.haloStatusIdClosed === "undefined") {
            this.$parent.notification.haloStatusIdClosed = 9;
        }
        if (typeof this.$parent.notification.haloAutoResolve === "undefined") {
            this.$parent.notification.haloAutoResolve = true;
        }
    }
};
</script>
