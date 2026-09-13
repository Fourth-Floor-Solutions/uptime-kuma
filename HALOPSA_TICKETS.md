# HaloPSA Tickets notification provider

Fork of upstream Uptime Kuma (branch `feature/halopsa-tickets`, based on tag `2.5.4`)
adding a notification type **"Halo PSA Tickets (open / close)"**.

Upstream already ships a provider called "Halo PSA", but that one only POSTs a small
JSON payload to a webhook URL and needs a Halo inbound-webhook runbook to do anything.
This provider talks to the HaloPSA REST API itself:

| Event | What happens |
|---|---|
| Monitor **DOWN** | OAuth2 (client credentials) → resolve client from the monitor's tag → `POST /api/Tickets` → ticket id remembered in `halopsa_ticket_mapping` |
| Monitor **DOWN** again while its ticket is still open | Private note "reported DOWN at …" added to the same ticket (no duplicate ticket) |
| Monitor **UP**, ticket untouched by anyone else | `POST /api/Actions` (outcome *Resolved*, closure note) then `POST /api/Tickets` (status → closed, closeddate) → mapping removed |
| Monitor **UP**, ticket has been actioned by a person | Ticket left open, public note "back UP at … ticket left open because …" added |
| Ticket closed by hand in Halo, monitor goes DOWN later | Stale mapping discarded, new ticket opened |
| **Test** button | Authenticates and reports how many active clients are visible; creates nothing |

"Actioned by a person" means: any action on the ticket whose `actionby_application_id`
is not the application that opened it (engineer notes, status changes, assignments,
e-mails), or a ticket status that is neither the configured *open* nor *closed* status.
The ticket id is the key throughout, so reassigning the ticket to another end user does
not affect matching.

## Files

- `server/notification-providers/halopsa-tickets.js` – provider (`name = "HaloPSATickets"`)
- `src/components/notifications/HaloPSATickets.vue` – settings form
- `db/knex_migrations/2026-09-13-0000-halopsa-tickets-mapping.js` – mapping table (guarded; the
  Dec-2025 fork created the same table)
- registrations in `server/notification.js`, `src/components/notifications/index.js`,
  `src/components/NotificationDialog.vue`

## HaloPSA prerequisites

1. **API application** – Configuration › Integrations › HaloPSA API › View Applications › New.
   Authentication method *Client ID and Secret (Services)*. Permissions: `all`, or at least
   read/edit tickets + read clients. Pick the agent the app acts as (its name appears on the
   ticket's "Opened" action). Copy the client secret – it is shown once.
2. **IDs** – ticket type, priority, open/closed status. Fourth Floor production values:

   | Setting | Value | Meaning |
   |---|---|---|
   | Ticket Type ID | 30 | R \| Incident (what the n8n path uses) – or 22 F \| Alert |
   | Priority ID | 4 | as used by the n8n path |
   | Status ID (open) | 1 | New |
   | Status ID (closed) | 9 | Closed |
   | Custom Field ID for Monitor ID | 212 | `CFUptimeKumaMonitorID` |
   | Summary prefix | `[MONITOR DOWN]` | keeps ticket history searchable |
   | Closure outcome | `Resolved` | must exist in Halo |
   | Note outcome | `Private Note` | HaloPSA rejects actions without an outcome; used for "back up" / "down again" notes |

3. **Client mapping** – every monitor carries a tag (default name `HaloClient`) whose value is
   either the numeric Halo client id or the client's exact name (case-insensitive). Names that
   match no client fall back to *Default Client ID* if set, otherwise the notification fails
   and the error is visible in the monitor's event list. A group monitor does not need a tag
   unless it should raise tickets itself.

## Uptime Kuma setup

Settings › Notifications › Setup Notification › type **Halo PSA Tickets (open / close)**.
Fill in tenant URL, client id, secret, the IDs above, tick *Close the ticket automatically*
and *Keep the ticket open if someone else has actioned it*, press **Test**, save, then
attach it to monitors (or tick *Apply on all existing monitors*).

## Build

```bash
cd uptime-kuma
git checkout feature/halopsa-tickets
npm ci && npm run build                 # produces dist/ – the Dockerfile copies it in
docker buildx build -f docker/dockerfile --target release \
  --platform linux/amd64 -t alexisskeates/uptime-kuma:halopsa-2.5.4 --load .
```

Deploy on CT 232 (`/usr/share/docker-volumes/uptime-kuma/docker-compose.yml`): set
`image: alexisskeates/uptime-kuma:halopsa-2.5.4`, then `docker compose up -d`. To move the
image without Docker Hub: `docker save alexisskeates/uptime-kuma:halopsa-2.5.4 | gzip` on the
build machine and `docker load` on the CT.

## Verified 13 Sep 2026 (local instance against production Halo, client 158 "Fourth Floor Solutions Dev")

- DOWN → ticket opened with type/priority/custom field 212 populated (tickets 132567–132571, all closed afterwards)
- UP on an untouched ticket → Resolved note + status Closed, same action trail as the n8n workflow
- UP on a ticket an engineer moved to In Progress → left open, visible "back UP" note; a later DOWN adds a
  hidden "reported DOWN" note to the same ticket; a later UP notes again without closing
- Status changes made through the API also produce hidden SLA Hold/Release actions; they carry the acting
  application's id so they are classified correctly

## Notes

- Tokens are cached per tenant for their lifetime minus 5 minutes; the client list is cached
  for one hour and refreshed once on a miss.
- `halopsa_ticket_mapping` rows are unique per (monitor, tenant). Deleting a monitor cascades.
- The provider never deletes or reopens tickets.
