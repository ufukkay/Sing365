# Server-side signatures: the Sigwide mail relay

Date: 2026-11-27. Decision: signatures are added only on the server, through Exchange Online mail flow. No Outlook add-in, so mail from every device and app (Outlook, phones, iPhone Mail, Gmail app with the work account) gets the signature.

## How a message flows

1. A user sends mail. Exchange Online's transport rule matches (first: members of the "Sigwide Test" group), stamps `X-Sigwide-Key: <tenant key>` and routes the message to the **Sigwide** outbound connector.
2. The connector delivers it over TLS to the relay (`apps/relay`, SMTP on port 25).
3. The relay checks that the connection comes from Exchange Online's ranges and that the key belongs to a tenant (`POST /api/relay/sign` on the web app, which also picks the signature with the same rules engine as the panel preview).
4. `packages/stamp` inserts the signature into the message's own HTML and plain-text bodies only (attachments, forwarded messages and every other byte pass through), removes the key header and adds `X-Sigwide-Signed`.
5. The relay hands the message back to the tenant's Exchange Online (the MX of a tenant domain, `*.mail.protection.outlook.com` / `*.mx.microsoft`), presenting its TLS certificate, which the **Sigwide** inbound connector recognises. Exchange delivers it; the rule skips it because of `X-Sigwide-Signed`.

The relay answers Exchange only after Exchange has taken the message back, so nothing is queued or stored on the relay: if anything fails, Exchange keeps the message and retries.

| situation | relay answer | effect |
| --- | --- | --- |
| signed, or passed through unchanged (S/MIME, meeting invite, auto-reply, no signature for the sender) | 250 | delivered, marked `X-Sigwide-Signed: 1` or `skipped; <reason>` |
| no key / unknown key | 550 | sender gets a bounce: misconfigured rule or abuse |
| connection not from Exchange Online | 554 at connect | |
| message already carries `X-Sigwide-Signed` (rule exception missing) | 554 | bounce instead of an endless loop |
| web app unreachable, key verified in the last 24 h | 250 | delivered unsigned (`skipped; no_signature`) |
| web app unreachable, key not verified recently | 451 | Exchange retries |
| Exchange does not take the message back | 451 (or its own 5xx) | Exchange retries (or bounces) |

## Where the signature goes

| client | marker | placement |
| --- | --- | --- |
| Outlook on the web, new Outlook | `<div id="appendonsend">` | above the quoted message |
| classic Outlook for Windows | bordered `From:` block (`border-top:solid #E1E1E1`) | above the quoted message |
| Outlook for iOS / Android | `<div id="ms-outlook-mobile-signature">` ("Get Outlook for iOS") | replaces that signature |
| Gmail, Apple Mail, others | `gmail_quote`, `<blockquote type="cite">`, `<blockquote>` | above the quote |
| new message / nothing recognised | | end of the body |

Plain text: above `________________`, `-----Original Message-----` (and Turkish forms), `On … wrote:` / `… şunu yazdı:` or the first `>` line. Reply/forward is detected from `In-Reply-To`/`References` or `RE:`, `FW:`, `YNT:`, `İLT:` subjects.

Known limits of server-side signatures: the sender does not see the signature while writing, and the copy in Sent Items has none (Exchange stores it before the relay). Encrypted/S/MIME mail is never changed.

## Running it

```
RELAY_SECRET=<same as the web app> SING365_API_URL=http://localhost:3000 pnpm --filter @sing365/relay dev
```

Production: `pnpm --filter @sing365/relay build` gives one file, `apps/relay/dist/relay.mjs` (`node dist/relay.mjs`). Settings: `RELAY_HOSTNAME` (public name, also the certificate's name), `RELAY_TLS_KEY_FILE`, `RELAY_TLS_CERT_FILE`, `RELAY_SECRET`, `SING365_API_URL`; optional `RELAY_PORT` (25), `RELAY_ALLOWED_NETWORKS` (defaults to Exchange Online's published ranges; check endpoints.office.com), `RELAY_RETURN_HOST` (only when a tenant's MX is not Exchange Online). One JSON log line per message: status, placement or reason, size, time. No addresses or content.

Host requirements: a fixed public host name with a publicly trusted certificate; inbound port 25 reachable from Exchange Online; **outbound port 25** to Exchange Online allowed (Azure allows it only on Enterprise Agreement / MCA-E subscriptions; many VPS providers block it until asked); the web app reachable from the relay (same machine is simplest).

## Exchange Online setup (per customer)

Follows Microsoft's "Integrate Exchange Online with an email add-on service" scenario.

1. Panel › Exchange bağlantısı: create the tenant's relay key (shown once); the page also writes the PowerShell for steps 3 to 5.
2. The relay's certificate name (e.g. `relay.talay.com`, 48 characters or less) must be an **accepted domain** of the tenant (Microsoft 365 admin center › Domains, verified by TXT). A subdomain of an already verified domain is quick.
3. Exchange admin center › Mail flow › Connectors › add **outbound**: from Office 365 to *your organization's email server*, name "Sigwide", use only when a transport rule redirects messages to it, smart host = relay host name, always use TLS with a certificate issued by a trusted CA whose name matches the smart host, keep internal Exchange headers.
   `New-OutboundConnector -Name Sigwide -ConnectorType OnPremises -IsTransportRuleScoped $true -UseMxRecord $false -SmartHosts <relay host> -TlsSettings DomainValidation -TlsDomain <relay host> -CloudServicesMailEnabled $true`
4. Add **inbound**: from your organization's email server to Office 365, identified by the certificate name = relay host name.
   `New-InboundConnector -Name Sigwide -ConnectorType OnPremises -SenderDomains * -RequireTls $true -TlsSenderCertificateName <relay host> -CloudServicesMailEnabled $true`
5. Mail flow › Rules › new rule "Sigwide imza": apply if the sender is one test person (`-From`) or a member of a mail-enabled test group (`-FromMemberOf`); actions: set message header `X-Sigwide-Key` to the key, and redirect the message to the "Sigwide" connector; except if message header `X-Sigwide-Signed` includes `1` or `skipped` (the loop guard); stop processing more rules.
6. Send a test mail; widen the group when it looks right.
