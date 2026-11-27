# Architecture: Sing365 (email signature management for Microsoft 365)

Reads: `replica/recon.md`, `replica/features.csv`. SQL: `replica/schema.sql` (validated on Postgres 16, 20 tables).
Date: 2026-11-27

## Stack

| layer | choice | why |
| --- | --- | --- |
| web (admin panel + API) | Next.js (App Router) + TypeScript | one codebase for UI, server actions and the add-in API |
| monorepo | pnpm workspaces: `apps/web`, `apps/addin`, `apps/relay` (phase 2), `packages/rules`, `packages/render`, `packages/db` | the rule engine and HTML renderer must be identical in the add-in API, the tester and the relay |
| styling | Tailwind, tokens from replica-design | |
| database | Postgres (Neon, EU region; Azure Database for PostgreSQL if a customer demands Azure-only) | relational data, JSONB for layouts and conditions, RLS available |
| ORM | Drizzle | SQL-first, schema in TypeScript, plain migrations |
| auth (admins) | Auth.js with the Microsoft Entra ID provider, multi-tenant (`organizations` authority) | customers sign in with their M365 work accounts; no passwords to store |
| Graph access | app-only tokens (client credentials) per tenant after admin consent | directory sync runs without a signed-in user |
| auth (add-in) | Nested App Authentication (MSAL in the add-in) -> access token for the Sing365 API, validated server-side (tid, oid, aud) | the add-in knows who is composing without a second login |
| payments | Stripe Billing, quantity = active mailboxes, 14-day trial | per-mailbox pricing is the category norm |
| email (transactional) | Resend | trial and billing notices, sync failure alerts |
| jobs | Inngest | directory sync for large tenants runs long and must resume; campaign start/end; seat counting |
| files | Cloudflare R2 behind `img.sing365.<domain>` | signature images must be hosted on a stable public HTTPS URL |
| hosting | Vercel (web, add-in static files) | zero-ops; add-in manifest needs HTTPS on a fixed domain |
| relay (phase 2) | Node SMTP service (`smtp-server` + `nodemailer`) on Azure Container Apps, 2+ regions, static outbound IPs | Exchange Online connectors need a TLS SMTP endpoint with a fixed host name; Azure keeps latency to Exchange low |

One database. No microservices beyond the relay, which has to be a separate process because it speaks SMTP.

## How a signature reaches an email

**Client-side (MVP).** Outlook add-in with event-based activation:
- `OnNewMessageCompose` / `OnNewAppointmentOrganizer`: call `GET /api/addin/signature?mode=new|reply&from=<address>`, then `body.setSignatureAsync(html)`; call `mailbox.item.disableClientSignatureAsync()` so the user's local signature does not stack.
- `OnMessageRecipientsChanged`: re-evaluate when a rule depends on internal/external recipients.
- `OnMessageFromChanged`: shared mailbox / send-as picks the mailbox's own signature.
- Deployed by the customer's admin through Microsoft 365 admin center > Integrated apps (one manifest, all users).
- The add-in caches the last HTML per (mode, template version) so compose works when the API is slow.

**Server-side (phase 2).** Customer creates an outbound connector to `relay.<domain>` and a transport rule that routes mail from Sing365 users through it, skipping messages that carry the `X-Sing365-Signed` header (already signed by the add-in) or a loop header. The relay parses MIME, inserts the signature HTML (and a plain-text version) under the newest reply, and returns mail to Exchange through an inbound connector authenticated by certificate. It never stores message bodies; it only writes a `signature_events` row.

## Schema

Tables: 20 (`replica/schema.sql`). Access rules: data-layer checks first, every query goes through `db.forTenant(tenantId)` which sets `app.tenant_id`; Postgres RLS on every tenant-owned table as the second guard.

Key decisions:
- `directory_users.overrides` wins over synced values, so a sync never wipes a self-service edit.
- Rule conditions are JSONB evaluated by `packages/rules`, not SQL, so the add-in API, rules tester and relay share one engine.
- `templates.version` is bumped on publish; the add-in cache keys on it.
- Soft delete for directory objects (`deleted_at`) so a user removed in Entra stops counting as a seat but history stays.
- `webhook_events` (provider, event_id) primary key makes Stripe and Graph webhooks idempotent.
- No message bodies, IPs or user agents are stored.

## API

### F01 Admin connects the tenant and ships a first signature

| method path | does | who | input | output |
| --- | --- | --- | --- | --- |
| GET /api/auth/signin/microsoft-entra-id | admin sign-in | anyone with a work account | | session |
| GET /onboarding/consent | redirect to Entra `/adminconsent` | owner | | redirect |
| GET /api/consent/callback | record consent, create tenant + subscription(trial), queue full sync | Entra redirect | tenant, admin_consent, state | redirect to S02 |
| POST action `startSync` | queue a sync now | admin | | sync_run id |
| POST action `saveTemplate` / `publishTemplate` | create/update layout, publish bumps version | editor (folder) | layout JSON | template |
| POST action `saveRule` | create/update rule | editor | rule JSON | rule |
| PUT action `setDeploymentMode` | client / server / both | owner | mode | tenant |
| GET /addin/manifest.json | unified manifest for Integrated Apps | public | | manifest |

### F02 User composes an email (client-side)

| method path | does | who | input | output |
| --- | --- | --- | --- | --- |
| GET /api/addin/signature | resolve rules + render HTML for the sender | add-in (NAA token) | mode, from, recipients (domains only) | { html, text, templateId, version } |
| GET /api/addin/signatures | list signatures assigned to the sender (picker) | add-in | from | [{id,name}] |
| POST /api/addin/events | batch usage events | add-in | [{templateId, mode, outcome}] | 204 |

### F03 Server-side (phase 2)

| interface | does | who |
| --- | --- | --- |
| SMTP relay.<domain>:25 STARTTLS | receive, sign, return to Exchange | Exchange Online connector (cert + tenant token header) |
| internal GET /api/relay/resolve | same resolution as F02, cached per sender for 5 min | relay (mTLS) |

### F04 / F07 Targeting and troubleshooting

| method path | does | who | input | output |
| --- | --- | --- | --- | --- |
| POST /api/rules/test | which template applies and why (trace) | editor | sender email, recipient emails, mode | { templateId, trace[] } |
| GET /api/diagnostics/events | recent signature_events with reasons | admin | filters | rows |

### F05 Campaigns

| method path | does | who | input | output |
| --- | --- | --- | --- | --- |
| POST action `saveCampaign` | create/schedule banner | editor | campaign | campaign |
| GET /r/:slug | log click, 302 to target | public | | redirect |
| GET /api/analytics/clicks | clicks by campaign/day | admin | range | series |

### F06 Self-service edits

| method path | does | who | input | output |
| --- | --- | --- | --- | --- |
| GET /me | the user's own fields | any directory user (Entra sign-in) | | form |
| POST action `updateMyFields` | write allowed keys into overrides | that user | {key: value} | user |
| POST action `uploadAttributesCsv` | bulk custom_attrs / overrides | admin | CSV | report |

Other: `/api/users`, `/api/groups` (read), `/api/brand-kits`, `/api/assets` (upload, 2 MB, PNG/JPEG/GIF), `/api/audit`, `/api/billing/portal`.

Webhooks in: Stripe (`/api/webhooks/stripe`: subscription and invoice events), Microsoft Graph change notifications for users and groups (`/api/webhooks/graph`, optional speed-up on top of delta sync).
Webhooks out: none in v1.

Jobs (Inngest):
- `directory.delta-sync`: every 4 h per tenant, plus on demand; Graph `/users/delta` and `/groups/delta` with `$select`, paged, resumable, 429-aware.
- `directory.photos`: after sync, fetch changed `/users/{id}/photo/$value`, resize to 192 px, store in R2.
- `campaigns.tick`: every 5 min, move campaigns scheduled -> live -> ended.
- `billing.count-seats`: daily, count licensed active mailboxes and update the Stripe quantity.
- `retention.cleanup`: daily, delete `signature_events` and `click_events` older than 13 months.

## The parts that bite

- **Email HTML.** Outlook desktop renders with Word: tables, inline styles, no flexbox, no SVG, no web fonts, explicit image width/height, retina images at 2x. Dark mode inverts colours. One renderer in `packages/render`, tested with snapshot HTML and real-client screenshots.
- **Reply placement.** The add-in inserts at the cursor signature slot; the relay must find the newest reply boundary in HTML from Outlook, OWA, iOS Mail and Gmail.
- **Graph limits.** Throttling (429 with Retry-After), delta tokens expire, `$select` must list extension attributes explicitly, photos are a separate call per user.
- **Consent.** Admin consent can be revoked at any time; detect 401/403 on sync and mark the tenant `revoked` with an alert.
- **Multi-tenancy.** Every query tenant-scoped; RLS second guard; add-in tokens must have `tid` matching a consented tenant.
- **Idempotency.** Stripe and Graph webhooks arrive twice; `webhook_events` primary key. Relay: Message-ID + header to avoid double signing.
- **Time zones.** Campaign windows stored in UTC with the campaign's IANA time zone for display and recurrence.
- **Relay reliability (phase 2).** Mail must never be lost: queue to disk, 2+ instances, health-checked connector with fallback; SPF include and DKIM stay with the customer's Exchange because mail is returned to Exchange for delivery.
- **GDPR / KVKK.** EU data region by default, data processing agreement, tenant deletion removes everything (`on delete cascade` from tenants), no message content stored.
- **Images.** Hosted images may be blocked by recipients' clients; keep alt text and a text fallback.

## Build order

1. **Vertical slice.** Admin signs in -> consents -> sync pulls users -> one hard-coded template with placeholders renders per user -> add-in inserts it in Outlook on the web.
   Screens S01, S03 (bare), S20. Tables tenants, admin_users, directory_users, templates, rules (one "all" rule). Routes consent callback, `/api/addin/signature`, manifest.
2. **Must-haves.**
   - Designer + preview: S04, S05, brand kits S08 (`templates`, `brand_kits`, `assets`, `packages/render`).
   - Rules: S06 with groups/departments, new vs reply, internal/external, priority (`rules`, `group_members`, `packages/rules`).
   - Disclaimers S09. Onboarding wizard S02, deployment page S13 (client mode).
   - Billing S18 with Stripe trial and seat counting.
   - Add-in on Windows, Mac, mobile; empty-field line hiding in the renderer.
3. **Should-haves.** Rules tester S07, exceptions, domain targeting, campaigns S10 with schedules and rotation, self-service S12 + editable fields, CSV attributes, folders + roles S14, audit S17, shared mailbox / send-as. Then the server-side relay (F03).
4. **Could-haves.** Click and usage analytics S15/S16, A/B, QR/vCard, social feed, HRIS and CRM targeting, diagnostics S19.
5. **Fixes from replica-entrepreneur:** not run yet.

## Summary

Stack: Next.js + TypeScript monorepo, Postgres (Neon) + Drizzle, Entra ID sign-in, Graph app-only sync, Outlook add-in, Stripe, Inngest, Vercel; SMTP relay on Azure in phase 2.
Tables: 20. Routes: about 30 plus 5 jobs.
Riskiest: email HTML that holds up in Outlook desktop; the relay never losing mail; Graph sync at scale.
Next step: `/replica-design`.
