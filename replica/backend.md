# Backend

Date: 2026-11-27. Reads `replica/architecture.md`.

## What is built

| part | where | status |
| --- | --- | --- |
| Postgres schema + migrations | `packages/db/migrations`, `pnpm --filter @sing365/db migrate` | done |
| Tenant isolation | `db.forTenant()` sets `app.tenant_id`; RLS forced on every tenant table (0002) | done, tested with a non-superuser role |
| Admin sign-in | Entra OIDC code flow + PKCE, id_token verified with Entra keys (aud, tid-bound issuer, nonce), signed http-only session cookie | done, needs a real tenant to try |
| Tenant onboarding | `/onboarding` -> Entra `/adminconsent` -> `/api/consent/callback` (state + tenant checked against the session) -> tenant + trial subscription + owner admin -> first sync | done |
| Directory sync | `packages/graph`: client credentials, `/users/delta` + `/groups/delta` with members, paging, 429/5xx retry, expired delta -> full resync, consent errors -> tenant `revoked` | done, tested with a fake Graph |
| Scheduled sync | `GET /api/cron/sync` with `CRON_SECRET` | done (schedule it every 4 h on the host) |
| Add-in auth | Office SSO token (`OfficeRuntime.auth.getAccessToken`), verified server-side; manifest `WebApplicationInfo` | done in code; needs "Expose an API" in Entra |
| Signatures from HTML | `/signatures/new`, `/signatures/[id]/edit`: the admin's own HTML with `{{field}}`, `{{field\|upper}}`, `{{#field}}…{{/field}}` and `{{^field}}…{{/field}}`; values escaped, result sanitised with an allow-list (`packages/render`) | done |
| Payments (Stripe) | | not started |
| Transactional email | | not started |
| Photos to object storage | | not started |

Decision change from architecture.md: the `postgres` driver with SQL instead of Drizzle (the SQL schema is the source of truth; no second schema in TypeScript). Auth is a small in-house OIDC flow instead of Auth.js, because multi-tenant Entra issuer checks are simpler to get right directly.

## Local database (no account needed)

`pnpm dev:local` starts a real PostgreSQL 17 from the `embedded-postgres` package (binaries for Windows, macOS and Linux come from npm), keeps its data in `.local-db/` (gitignored), creates a non-superuser `sing365_app` owner so row-level security applies as it does on Neon, runs the migrations and then `next dev` with `DATABASE_URL` pointing at it. It listens on localhost only, on the first free port of 15432, 25432, 35432 and 45432 (Windows reserves many higher ports). Ctrl+C stops both; delete `.local-db/` for an empty database. Production still uses a hosted database (Neon EU).

## Entra setup (development tenant)

- App registration "Sing365 (geliştirme)", multi-tenant, Web redirects `http://localhost:3000/api/auth/callback/microsoft-entra-id` (sign-in) and `http://localhost:3000/api/consent/callback` (organisation consent). Both are needed; a missing one fails with AADSTS50011.
- Graph application permissions: `User.Read.All`, `GroupMember.Read.All`. Delegated: `User.Read` (+ openid, profile, email).
- Still to do by a tenant admin: grant admin consent; create a client secret into `.env.local`; for Outlook SSO, "Expose an API" with Application ID URI `api://<host>/<client id>` and scope `access_as_user`, then set `ENTRA_API_AUDIENCE`.
- Graph change notifications are not used yet (delta every 4 h is enough for signatures).

## Security checklist

- [x] secrets only in env vars, `.env*` git-ignored, nothing in client bundles
- [x] input validated on the server on every route (email format, mode, recipient cap 500)
- [x] authorisation on every read/write: `forTenant` + RLS, tested with a second tenant
- [x] OAuth state, nonce and PKCE; consent callback bound to the signed-in admin's tenant
- [x] add-in API: token-only (no cookies), CORS `*` is safe because of that; dev bypass disabled in production
- [ ] rate limits on sign-in and the add-in API (host level or middleware)
- [ ] webhooks verify signatures (no webhooks yet; Stripe will)
- [ ] uploads: size/type limits (schema enforces; upload route not built)
- [x] no user data in URLs or logs (recipients are only used in memory to pick internal/external)
- [ ] `pnpm audit` in CI
- [ ] privacy policy listing processors (host, database, Microsoft Graph)

## Running the integration tests

```bash
createdb s365test
DATABASE_URL=postgres://<superuser>@localhost/s365test pnpm --filter @sing365/db migrate
# a non-superuser role so RLS applies:
psql s365test -c "create role s365_app login password '...'; grant usage on schema public to s365_app; grant select,insert,update,delete on all tables in schema public to s365_app; grant usage,select on all sequences in schema public to s365_app;"
TEST_DATABASE_URL=postgres://<superuser>@localhost/s365test TEST_APP_DATABASE_URL=postgres://s365_app:...@localhost/s365test pnpm test
```
