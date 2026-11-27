# Server-side signatures: the Sing365 mail relay

Date: 2026-11-27. Decision: signatures are added only on the server, through Exchange Online mail flow. No Outlook add-in, so mail from every device and app (Outlook, phones, iPhone Mail, Gmail app with the work account) gets the signature.

## How a message flows

1. A user sends mail. Exchange Online's transport rule matches (first: members of the "Sing365 Test" group), stamps `X-Sing365-Key: <tenant key>` and routes the message to the **Sing365** outbound connector.
2. The connector delivers it over TLS to the relay (`apps/relay`, SMTP on port 25).
3. The relay checks that the connection comes from Exchange Online's ranges and that the key belongs to a tenant (`POST /api/relay/sign` on the web app, which also picks the signature with the same rules engine as the panel preview).
4. `packages/stamp` inserts the signature into the message's own HTML and plain-text bodies only (attachments, forwarded messages and every other byte pass through), removes the key header and adds `X-Sing365-Signed`.
5. The relay hands the message back to the tenant's Exchange Online (the MX of a tenant domain, `*.mail.protection.outlook.com` / `*.mx.microsoft`), presenting its TLS certificate, which the **Sing365** inbound connector recognises. Exchange delivers it; the rule skips it because of `X-Sing365-Signed`.

The relay answers Exchange only after Exchange has taken the message back, so nothing is queued or stored on the relay: if anything fails, Exchange keeps the message and retries.

| situation | relay answer | effect |
| --- | --- | --- |
| signed, or passed through unchanged (S/MIME, meeting invite, auto-reply, no signature for the sender) | 250 | delivered, marked `X-Sing365-Signed: 1` or `skipped; <reason>` |
| no key / unknown key | 550 | sender gets a bounce: misconfigured rule or abuse |
| connection not from Exchange Online | 554 at connect | |
| message already carries `X-Sing365-Signed` (rule exception missing) | 554 | bounce instead of an endless loop |
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

Host requirements: a fixed public host name with a publicly trusted certificate; inbound port 25 reachable from Exchange Online; **outbound port 25** to Exchange Online allowed (several clouds block it by default, so check before choosing a host); the web app reachable from the relay (same machine is simplest).

## Exchange Online setup (per customer)

1. Panel: create the tenant's relay key (shown once). *(Panel page still to build.)*
2. Exchange admin center › Mail flow › Connectors › add **outbound**: from Office 365 to partner organization, name "Sing365", use only when a transport rule redirects messages to it, smart host = relay host name, always use TLS, certificate issued by a trusted CA and matching the relay host name.
3. Add **inbound**: from your organization's email server to Office 365, identify by the certificate subject = relay host name.
4. Mail flow › Rules › new rule "Sing365 imza": apply if the sender is a member of "Sing365 Test"; actions: set message header `X-Sing365-Key` to the key, and redirect the message to the "Sing365" connector; except if message header `X-Sing365-Signed` includes `1` or `skipped`.
5. Send a test mail; widen the group when it looks right.
