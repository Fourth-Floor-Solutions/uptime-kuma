# HaloPSA Integration Setup Guide

This guide explains how to set up and use the HaloPSA notification integration in Uptime Kuma.

## Overview

The HaloPSA integration allows Uptime Kuma to automatically:
- Create tickets in HaloPSA when monitors go DOWN
- Add notes to existing tickets when monitors remain DOWN
- Close tickets automatically when monitors recover (optional)
- Map monitors to specific HaloPSA clients using tags

## Prerequisites

1. A HaloPSA instance (e.g., `https://yourcompany.halopsa.com`)
2. API access credentials (Client ID and Client Secret)
3. Knowledge of your HaloPSA configuration (ticket types, status IDs, client IDs)

## Step 1: Create HaloPSA API Application

1. Log in to your HaloPSA instance
2. Navigate to: **Configuration** > **Integrations** > **HaloPSA API**
3. Click **View Applications**
4. Click **+ New** to create a new application
5. Configure the application:
   - **Name**: `Uptime Kuma Integration`
   - **Authentication Method**: `Client ID and Client Secret (Services)`
   - **Permissions**: Add the following scopes:
     - `edit:tickets`
     - `read:tickets`
     - `all` (recommended for full access)
6. Click **Save**
7. **Important**: Copy the **Client ID** and **Client Secret** immediately (the secret is shown only once!)

## Step 2: Find Required HaloPSA IDs

You'll need to know several ID values from your HaloPSA configuration:

### Client ID
- Navigate to **Clients** in HaloPSA
- Open a client record
- The Client ID is shown in the URL or client details

### Ticket Type ID
- Navigate to **Configuration** > **Tickets** > **Ticket Types**
- The ID is shown in the ticket type list

### Status IDs
- Navigate to **Configuration** > **Advanced Settings** > **Lookup Codes**
- Find the **Ticket Status** lookup
- Common values:
  - `1` = Open/New
  - `9` = Closed/Resolved
- Note the IDs for your "Open" and "Closed" statuses

### Priority ID
- Navigate to **Configuration** > **Advanced Settings** > **Lookup Codes**
- Find the **Ticket Priority** lookup
- Note the ID for your desired priority (e.g., `2` = Medium)

## Step 3: Configure HaloPSA Notification in Uptime Kuma

1. In Uptime Kuma, go to **Settings** > **Notifications**
2. Click **Setup Notification**
3. Select **HaloPSA** from the notification type dropdown
4. Configure the following fields:

### Required Fields

- **Friendly Name**: Give your notification a name (e.g., "HaloPSA Production")
- **HaloPSA Tenant URL**: Your HaloPSA instance URL
  - Example: `https://yourcompany.halopsa.com`
- **Client ID**: The API Application Client ID from Step 1
- **Client Secret**: The API Application Client Secret from Step 1
- **API Scope**: The permissions scope
  - Example: `all` or `edit:tickets read:tickets`
- **Default Client ID**: The default HaloPSA client ID for tickets
  - This is used when monitors don't have a client tag

### Ticket Configuration

- **Client Mapping Tag Name**: Tag name for per-monitor client mapping (default: `HaloClient`)
- **Ticket Type ID**: HaloPSA ticket type (default: `1`)
- **Priority ID**: Ticket priority (default: `2`)
- **Status ID (Open)**: Status for new tickets (default: `1`)
- **Status ID (Closed)**: Status for resolved tickets (default: `9`)
- **Auto Resolve**: Enable to automatically close tickets when monitors recover

### Optional Fields

- **Site ID**: Associate tickets with a specific site
- **Category 1**: Primary category for tickets
- **Category 2**: Secondary category for tickets

5. Click **Test** to verify the connection
6. Click **Save**

## Step 4: Map Monitors to HaloPSA Clients (Optional)

To map specific monitors to specific HaloPSA clients:

1. Go to **Tags** in Uptime Kuma
2. Create a new tag named `HaloClient` (or whatever you configured as "Client Mapping Tag Name")
3. Edit your monitor
4. Add the `HaloClient` tag with the **value** set to the HaloPSA client ID
   - Example: Tag name: `HaloClient`, Tag value: `123`
5. Save the monitor

**How it works:**
- When a monitor with a `HaloClient` tag goes DOWN, a ticket is created for that specific client
- If the monitor has no `HaloClient` tag, the Default Client ID is used

## Step 5: Assign Notification to Monitors

1. Edit a monitor or create a new one
2. In the **Notifications** section, select your HaloPSA notification
3. Save the monitor

## How It Works

### When a Monitor Goes DOWN
1. Uptime Kuma creates a new ticket in HaloPSA
2. The ticket includes:
   - Monitor name and status
   - Error details
   - Monitor URL/hostname/port
   - Timestamp
3. The ticket is associated with the correct client (via tag or default)
4. The ticket ID is stored internally for later updates

### When a Monitor Stays DOWN
- Uptime Kuma adds a note to the existing ticket with updated error information
- No duplicate tickets are created

### When a Monitor Recovers (UP)
- If **Auto Resolve** is enabled: The ticket is automatically closed
- If **Auto Resolve** is disabled: The ticket remains open for manual closure

## Troubleshooting

### Authentication Errors
- Verify your Client ID and Client Secret are correct
- Check that the API Scope includes the necessary permissions
- Ensure your HaloPSA instance URL is correct (include `https://`)

### Ticket Creation Fails
- Verify the Default Client ID exists in HaloPSA
- Check that Ticket Type ID, Priority ID, and Status IDs are valid
- Some HaloPSA configurations require additional mandatory fields
  - If you get errors about required fields, check your ticket type configuration in HaloPSA
  - You may need to make certain fields optional or use the Category fields

### Client Mapping Not Working
- Verify the tag name matches the "Client Mapping Tag Name" setting
- Ensure the tag **value** is set to a valid HaloPSA client ID (numeric)
- Check that the monitor has the tag assigned

### Tickets Not Closing Automatically
- Ensure **Auto Resolve** is enabled in the notification settings
- Verify the Status ID (Closed) is correct
- Check that the ticket exists in HaloPSA and is associated with the monitor

## Advanced Configuration

### Multiple HaloPSA Instances
You can create multiple HaloPSA notification configurations:
- One for production clients
- One for internal/test clients
- Different configurations for different client groups

### Custom Ticket Fields
The integration supports optional fields:
- **Site ID**: For multi-site clients
- **Category 1 & 2**: For ticket categorization
- Additional custom fields may require code modifications

### Integration with Monitor Groups
Use tags to organize monitors:
- Tag monitors by client: `HaloClient: 123`
- Tag monitors by department: `Department: IT`
- Tag monitors by priority: `Priority: Critical`

## API Rate Limits

HaloPSA may have API rate limits depending on your subscription:
- The integration caches OAuth tokens (1 hour) to minimize auth requests
- Each DOWN/UP event triggers one API call
- Monitor notes (continued downtime) trigger additional API calls

## Database

The integration creates a table `halopsa_ticket_mapping` to track:
- Which monitors have open tickets
- The ticket ID for each monitor
- When tickets were created

This ensures:
- No duplicate tickets are created
- Tickets can be closed when monitors recover
- Proper state management across restarts

## Security Notes

- Client Secrets are stored in the Uptime Kuma database
- They are not encrypted at rest (standard for Uptime Kuma)
- Use strong authentication for your Uptime Kuma instance
- Limit API scope to minimum required permissions (`edit:tickets read:tickets`)

## Support

For issues with:
- **HaloPSA Integration**: Check the Uptime Kuma logs for error messages
- **HaloPSA API**: Consult HaloPSA support or documentation
- **Uptime Kuma**: Visit https://github.com/louislam/uptime-kuma

## Example Configuration

```json
{
  "type": "HaloPSA",
  "name": "Production Tickets",
  "haloTenantUrl": "https://yourcompany.halopsa.com",
  "haloClientId": "abc123def456",
  "haloClientSecret": "***HIDDEN***",
  "haloScope": "all",
  "haloDefaultClientId": 42,
  "haloTagName": "HaloClient",
  "haloTicketTypeId": 1,
  "haloPriorityId": 2,
  "haloStatusIdOpen": 1,
  "haloStatusIdClosed": 9,
  "haloAutoResolve": true
}
```

## Migration Notes

If you're migrating from another monitoring system:
1. Existing tickets are not automatically linked
2. New monitors will create new tickets
3. You can manually close old tickets in HaloPSA
4. The integration starts with a clean state

## Future Enhancements

Potential improvements for future versions:
- Support for ticket comments/updates
- Custom field mapping
- Ticket assignment to specific agents
- Integration with HaloPSA SLA tracking
- Support for ticket templates
