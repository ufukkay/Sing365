# Recon map: Exclaimer (Microsoft 365 edition, web admin + Outlook)

Scope: centralized email signature management for Microsoft 365 tenants: admin web app, signature designer, rules, directory sync, client-side delivery (Outlook add-in) and server-side delivery (Exchange Online connector routing). Google Workspace, Exchange on-premises and Meeting Branding are out of scope for v1.
For: Sing365, a product Ufuk Kaya intends to sell to Microsoft 365 organizations (assumed; confirm).
Date: 2026-11-27

Method: public sources only (pricing page, product page, public help-center glossary, Microsoft Learn). No account was used, so screen states are inferred from docs and marked as such. This file is research. Nothing in it (names, copy, colours) goes into the product. `replica-brand/sweep.py --avoid "Exclaimer"` must pass before launch.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | pricing page | https://www.exclaimer.com/pricing | 4 tiers, per active mailbox, 10-user minimum, feature gates |
| 2 | marketing site (M365 product) | https://exclaimer.com/product/signatures-for-office-365/ | deployment modes, Graph permissions, integrations |
| 3 | help center index | https://support.exclaimer.com/hc/en-gb/articles/360050643051-Welcome-to-the-Exclaimer-Online-Guide | section structure of the admin app |
| 4 | help center glossary | https://support.exclaimer.com/hc/en-gb/articles/360050338692 | attributes, rules, folders, add-in, diagnostics |
| 5 | Microsoft Learn | https://learn.microsoft.com/en-us/microsoft-365/admin/setup/create-signatures-and-disclaimers | what M365 does natively (transport-rule disclaimers) and its limits |
| 6 | the user's own account | not used | terms of a trial account may forbid competitive use; public sources only |

## Core loop

An admin connects the Microsoft 365 tenant, designs a signature template with directory placeholders, assigns it to people by rule, and every outgoing email then carries an up-to-date, consistent signature without users doing anything.

## Why the market exists (from source 5)

Native M365 transport-rule "disclaimers" cannot place the signature under the latest reply, are not visible in Sent Items, cannot embed images, and drop lines with empty variables. Every gap is a feature here.

## Screens

States: none observed directly (no account). "Expected" lists the states the build must cover.

| ID | screen | route / how to reach | purpose | key components | expected states |
| --- | --- | --- | --- | --- | --- |
| S01 | Sign in / connect tenant | first visit | Entra ID sign-in, admin consent for Graph permissions | OAuth button, consent result | not consented, consent denied, success |
| S02 | Onboarding wizard | after first consent | pick deployment mode, first template, first sync | stepper, mode cards | step n of m, error |
| S03 | Dashboard | `/` | status of sync, deployment, active signatures, campaigns | stat tiles, alerts | empty (new tenant), filled, sync error |
| S04 | Signatures list | `/signatures` | list, folders, order, duplicate, import/export | table, folder tree, drag-reorder | empty, filled |
| S05 | Signature designer | `/signatures/:id` | drag-and-drop email-safe layout with placeholders | canvas, element palette, properties panel, preview per user | new, editing, unsaved, invalid HTML, preview as user |
| S06 | Rules for a signature | `/signatures/:id/rules` | who sends (users, groups, departments), to whom (internal/external, domains), exceptions, new vs reply | condition builder | no rules, filled, conflict |
| S07 | Rules tester | `/signatures/test` | simulate sender + recipient, show which signature applies and why | form, result trace | match, no match |
| S08 | Brand kits | `/brand` | logos, colours, fonts, social links reused across templates | asset uploader, colour list | empty, filled |
| S09 | Disclaimers | `/disclaimers` | legal text by region, department or recipient | rich text, rules | empty, filled |
| S10 | Campaigns / banners | `/campaigns` | promotional banners, date range or repeating schedule, rotation | banner list, scheduler, targeting | empty, scheduled, live, ended |
| S11 | Users & directory | `/users` | synced users, attribute values, extra custom attributes, CSV override upload | table, attribute mapping | not synced, syncing, filled, sync error |
| S12 | User details editor | `/users/:id` and self-service link | admin or user edits allowed fields | form | read-only field, saved |
| S13 | Deployment settings | `/settings/deployment` | client-side add-in status; server-side connector + transport rule setup, SPF guidance | checklist, copyable PowerShell/records | not set up, partial, verified |
| S14 | Admins & roles | `/settings/admins` | delegated editors per folder, roles | table, invite | single admin, many |
| S15 | Analytics: usage | `/analytics/usage` | which signatures are being applied, by whom | charts, table | no data, filled |
| S16 | Analytics: engagement | `/analytics/engagement` | banner/link clicks, A/B test | charts | no data, filled |
| S17 | Audit log | `/audit` | who changed what | filterable table | empty, filled |
| S18 | Billing | `/settings/billing` | plan, seats (active mailboxes), invoices | plan cards | trial, active, past due |
| S19 | Diagnostics | `/help/diagnostics` | message capture / logs to explain why a mail got no signature | log table | empty, filled |
| S20 | Outlook add-in pane | inside Outlook compose | auto-insert on compose, pick another assigned signature, edit allowed fields | task pane, list | signed out, no signature assigned, inserted |

## Flows

```
F01 Admin connects the tenant and ships a first signature
    S01 -> S02 -> S05 -> S06 -> S13 -> S03
    happy path clicks: target <= 10
    edge: consent denied, user without admin role, tenant with 0 users, sync of 10k+ users

F02 User composes an email and gets the signature (client-side)
    S20 (automatic on new message / reply)
    happy path clicks: 0
    edge: reply vs new mail, shared mailbox / send-as, alias address, mobile Outlook, offline, user with empty phone field (line must hide)

F03 Email gets the signature on the server (server-side)
    sent from any client -> connector -> Sing365 relay -> back to Exchange -> recipient
    happy path clicks: 0
    edge: mail already signed by add-in (skip), encrypted/S-MIME mail, calendar invites, relay down (mail must not be lost), SPF/DKIM alignment, loops

F04 Admin targets a signature to a department
    S04 -> S06 -> S07
    edge: user in two groups (order decides), external-only rule

F05 Marketing runs a scheduled banner campaign
    S10 -> S06 -> S16
    edge: overlapping campaigns, time zones, end date passes

F06 Employee updates their own phone number
    S20 or self-service link -> S12 -> next mail shows it
    edge: field not editable, directory sync overwrites it

F07 Admin finds out why a mail had no signature
    S07 / S19
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, danger | default, hover, focus, disabled, loading | all |
| Data table | sortable, selectable, draggable rows | empty, loading, filled | S04, S11, S14, S17, S19 |
| Condition builder | sender, recipient, exception, schedule | empty, valid, conflict | S06, S09, S10 |
| Designer canvas | element: text, image, divider, social icons, banner, table/columns, placeholder field | selected, hover, drag | S05 |
| Placeholder picker | directory field, custom attribute | has value, empty in preview | S05, S09 |
| Live preview | as a chosen user, new vs reply, light/dark | | S05, S07 |
| Scheduler | date range, repeating | | S10 |
| Stepper | | | S02, S13 |
| Stat tile, line/bar chart | | no data | S03, S15, S16 |
| Toast, confirm modal | | | all |

## Inferred data model

```
Tenant        id, m365_tenant_id, name, plan, seats, deployment_mode (client|server|both), created_at
              evidence: sources 1, 2 (per-tenant consent, per-mailbox pricing)   confidence: high
DirectoryUser id, tenant_id, entra_object_id, email, aliases[], display_name, job_title, department,
              office, phones, photo_url, manager_id, custom_attributes (json, up to ~100), overrides (json), is_active
              evidence: source 4 (additional attributes, user details upload)    confidence: high
Group         id, tenant_id, entra_group_id, name; GroupMember(user_id, group_id)
              evidence: source 2 (assign by group/department)                   confidence: high
BrandKit      id, tenant_id, name, logo_asset_id, colours (json), fonts, social_links (json)
              evidence: source 1 (brand kits per tier)                           confidence: high
Template      id, tenant_id, folder_id, name, kind (signature|disclaimer|banner), body (json layout), html_cache, brand_kit_id, sort_order
              evidence: sources 3, 4                                             confidence: high
Folder        id, tenant_id, name, editors[]                                     confidence: medium
Rule          id, template_id, senders (json), recipients (json: internal|external|domains), exceptions (json),
              applies_to (new|reply|both), schedule (json), priority
              evidence: source 4 (rules, exceptions, tester, order)              confidence: high
Campaign      id, tenant_id, banner_template_id, start_at, end_at, recurrence, rotation_group, target rule
              evidence: source 1                                                 confidence: medium
EditableField id, tenant_id, attribute_key, editable_by (user|admin)             confidence: medium
AdminUser     id, tenant_id, email, role (owner|admin|editor), folder scope      confidence: medium
AuditEvent    id, tenant_id, actor, action, entity, before, after, at            confidence: high
ClickEvent    id, tenant_id, campaign_id/link_id, user_id (sender), at, variant  confidence: medium (guess on shape)
MessageLog    id, tenant_id, message_id, sender, applied_template_id, reason, at (server-side only, short retention)  confidence: guess
Subscription  id, tenant_id, plan, seats, status, provider_ref                   confidence: high
```

Relationships: Tenant 1-n DirectoryUser, Group, Template, BrandKit, AdminUser. Template 1-n Rule. Campaign 1-1 banner Template. DirectoryUser n-n Group.

## Feature matrix

See `features.csv`. Must: 16, should: 13, could: 9, skip: 4.

## Out of scope (cannot or should not be cloned)

- Their brand, copy, designer look, templates gallery content and help articles.
- Their datacenter footprint and certifications (SOC 2, ISO 27001): Sing365 has to earn its own.
- Partner/marketplace listings and CRM partner deals (we can integrate via official APIs later, but not their deals).
- Google Workspace and Exchange on-premises for v1 (scope choice, not a legal limit).

## Size

Screens 20, flows 7, entities 14. Hard parts:
1. Email-safe HTML rendering that looks right in Outlook desktop (Word engine), OWA, mobile, dark mode.
2. Server-side relay: a mail-handling service that must never lose or delay mail, plus connector/transport-rule setup and SPF/DKIM.
3. Outlook add-in with event-based activation across clients, including reply/forward placement and shared mailboxes.

Size: L for client-side MVP plus admin app (a quarter); server-side relay adds another M.

Next step: `/replica-architect`.
