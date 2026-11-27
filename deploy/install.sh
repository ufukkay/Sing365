#!/usr/bin/env bash
# Installs or updates Sigwide on a fresh Ubuntu server with Docker. Run as root:
#   bash <(curl -fsSL https://raw.githubusercontent.com/ufukkay/Sing365/main/deploy/install.sh)
# Running it again pulls the latest code and restarts what changed. Settings live in /opt/sigwide/deploy/.env.
# The first run asks for the settings; SIGWIDE_HOST, SIGWIDE_RELAY_HOST and ENTRA_CLIENT_ID can be given as
# environment variables instead. The Entra client secret is always typed at the prompt, never on the command line.
# Both host names need DNS A records pointing at this server before the first run (for the HTTPS certificates).
set -euo pipefail

REPO="${SIGWIDE_REPO:-https://github.com/ufukkay/Sing365.git}"
BRANCH="${SIGWIDE_BRANCH:-main}"
DIR="${SIGWIDE_DIR:-/opt/sigwide}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
  say "Docker kuruluyor..."
  curl -fsSL https://get.docker.com | sh
fi
command -v git >/dev/null || { apt-get update -q && apt-get install -yq git; }

if [ -d "$DIR/.git" ]; then
  say "Kod güncelleniyor ($BRANCH)..."
  git -C "$DIR" fetch -q origin "$BRANCH"
  git -C "$DIR" checkout -q "$BRANCH"
  git -C "$DIR" reset -q --hard "origin/$BRANCH"
else
  say "Kod indiriliyor ($BRANCH)..."
  git clone -q --branch "$BRANCH" "$REPO" "$DIR"
fi

cd "$DIR/deploy"
if [ ! -f .env ]; then
  say "İlk kurulum ayarları"
  host="${SIGWIDE_HOST:-}"
  relay_host="${SIGWIDE_RELAY_HOST:-}"
  client_id="${ENTRA_CLIENT_ID:-}"
  [ -n "$host" ] || read -rp "Panelin adresi (örn. app.alanadi.com): " host </dev/tty
  [ -n "$relay_host" ] || read -rp "Posta rölesinin adresi (örn. relay.alanadi.com): " relay_host </dev/tty
  [ -n "$client_id" ] || read -rp "Entra uygulama (client) kimliği: " client_id </dev/tty
  read -rsp "Entra istemci gizli anahtarı (yazdıklarınız ekranda görünmez, bitince Enter): " client_secret </dev/tty
  echo
  gen() { openssl rand -hex 32; }
  umask 077
  cat > .env <<ENV
SIGWIDE_HOST='$host'
SIGWIDE_RELAY_HOST='$relay_host'
ENTRA_CLIENT_ID='$client_id'
ENTRA_CLIENT_SECRET='$client_secret'
POSTGRES_PASSWORD='$(gen)'
DB_APP_PASSWORD='$(gen)'
SESSION_SECRET='$(gen)'
CRON_SECRET='$(gen)'
RELAY_SECRET='$(gen)'
ENV
  say "Ayarlar $DIR/deploy/.env dosyasına yazıldı (yalnızca root okuyabilir)."
fi

# Ports Sigwide needs: web (80, 443) and mail from Exchange Online (25).
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null; ufw allow 443 >/dev/null; ufw allow 25/tcp >/dev/null
fi

say "Uygulama derleniyor ve başlatılıyor (ilk seferde 5-10 dakika sürebilir)..."
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null

host="$(grep '^SIGWIDE_HOST=' .env | cut -d"'" -f2)"
say "Hazır: https://$host"
docker compose ps --format 'table {{.Service}}\t{{.Status}}'
