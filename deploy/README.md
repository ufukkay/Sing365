# Deploying Sigwide on one server

Everything runs with Docker Compose on a single Linux server (tested on Ubuntu 24.04):

| service | what it does |
| --- | --- |
| `caddy` | HTTPS for the panel (Let's Encrypt), and fetches/renews the relay's certificate |
| `postgres` | the database; the app connects as `sing365_app`, a normal owner role, so row-level security applies |
| `web` | the panel; applies new migrations on every start |
| `relay` | the mail relay on port 25, on the host network so it sees Exchange Online's real addresses |
| `cron` | calls `/api/cron/sync` every 30 minutes |

## First install

1. Point DNS A records at the server: the panel (e.g. `app.example.com`), the relay (e.g. `relay.example.com`), and the public page (`example.com` and `www.example.com`; the page's host defaults to the panel's parent domain, override with `SIGWIDE_SITE_HOST`).
2. In the Entra app registration, add the redirect URIs `https://<panel>/api/auth/callback/microsoft-entra-id` and `https://<panel>/api/consent/callback`, and create a client secret.
3. As root on the server:

```bash
SIGWIDE_HOST=app.example.com SIGWIDE_RELAY_HOST=relay.example.com ENTRA_CLIENT_ID=<client id> \
  bash <(curl -fsSL https://raw.githubusercontent.com/ufukkay/Sing365/main/deploy/install.sh)
```

It asks for the client secret (hidden input), generates the other secrets into `/opt/sigwide/deploy/.env`
(root only), builds the images and starts everything. To install from a branch, add `SIGWIDE_BRANCH=<branch>`.

## Update

Run the same `install.sh` line again: it pulls the branch, rebuilds and restarts what changed. `.env` is kept.

## Useful commands

```bash
cd /opt/sigwide/deploy
docker compose ps                 # status
docker compose logs -f relay      # one JSON line per message (no addresses)
docker compose logs -f web
```

The relay waits until Caddy has the relay host's certificate, and reloads it after each renewal.
Hostinger VPS: port 25 is open, but outbound mail is limited to 5 messages a minute (see replica/relay.md).
