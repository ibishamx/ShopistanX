#!/usr/bin/env bash
# Shopistan installer for a fresh Ubuntu server. Run as root:
#
#   curl -fsSL https://raw.githubusercontent.com/ibishamx/ShopistanX/claude/bold-ptolemy-2k1x3w/deploy/install.sh | DOMAIN=yourname.duckdns.org bash
#
# Without DOMAIN it uses <server-ip>.sslip.io, which needs no DNS setup but
# shares certificate limits with everyone using sslip.io, so store addresses
# may sometimes fail to get a certificate. Run it again any time to update.
set -euo pipefail

REPO="${REPO:-https://github.com/ibishamx/ShopistanX.git}"
BRANCH="${BRANCH:-claude/bold-ptolemy-2k1x3w}"
DIR="${INSTALL_DIR:-/opt/shopistan}"
ENV_FILE="$DIR/deploy/.env.production"
COMPOSE=(docker compose -f "$DIR/deploy/docker-compose.prod.yml" --env-file "$ENV_FILE")

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mError: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || fail "Run this as root (type: sudo -i, then paste the command again)."

# Building the apps needs about 3 GB of memory; add swap on small servers.
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$mem_mb" -lt 3500 ] && ! swapon --show | grep -q .; then
  say "Adding 4 GB of swap (this server has ${mem_mb} MB of memory)"
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if ! command -v git >/dev/null || ! command -v curl >/dev/null || ! command -v openssl >/dev/null; then
  say "Installing git, curl and openssl"
  apt-get update -qq && apt-get install -y -qq git curl openssl >/dev/null
fi
if ! command -v docker >/dev/null; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh >/dev/null
fi

if [ -d "$DIR/.git" ]; then
  say "Updating the code in $DIR"
  git -C "$DIR" fetch -q origin "$BRANCH"
  git -C "$DIR" checkout -q "$BRANCH"
  git -C "$DIR" merge -q --ff-only "origin/$BRANCH" || fail "Local changes in $DIR block the update."
else
  say "Downloading Shopistan to $DIR"
  git clone -q --branch "$BRANCH" "$REPO" "$DIR"
fi

IP="$(curl -4 -fsS --max-time 10 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
[ -n "$IP" ] || fail "Could not find this server's public IP address."

if [ ! -f "$ENV_FILE" ]; then
  DOMAIN="${DOMAIN:-${IP//./-}.sslip.io}"
  say "Creating settings for $DOMAIN"
  rand() { openssl rand -hex "$1"; }
  umask 077
  cat > "$ENV_FILE" <<CONF
DOMAIN=$DOMAIN
ACME_EMAIL=${ACME_EMAIL:-}
POSTGRES_PASSWORD=$(rand 24)
APP_DB_PASSWORD=$(rand 24)
PLATFORM_DB_PASSWORD=$(rand 24)
ENCRYPTION_KEY=$(rand 32)
PLATFORM_ADMIN_EMAIL=${PLATFORM_ADMIN_EMAIL:-admin@$DOMAIN}
PLATFORM_ADMIN_PASSWORD=$(rand 10)
WHATSAPP_GRAPH_VERSION=v23.0
CADDY_EXTRA_GLOBAL=${CADDY_EXTRA_GLOBAL:-}
CONF
  umask 022
elif [ -n "${DOMAIN:-}" ] && ! grep -qx "DOMAIN=$DOMAIN" "$ENV_FILE"; then
  say "Changing the domain to $DOMAIN"
  sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN/" "$ENV_FILE"
fi
get() { grep "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }
DOMAIN="$(get DOMAIN)"

# Warn early if DNS does not point here yet (certificates would fail).
for host in "$DOMAIN" "app.$DOMAIN"; do
  resolved="$(getent ahostsv4 "$host" | awk 'NR==1 {print $1}' || true)"
  if [ "$resolved" != "$IP" ]; then
    printf '\033[33mWarning: %s points to "%s", not this server (%s). Fix the DNS record; HTTPS starts working once it does.\033[0m\n' "$host" "${resolved:-nothing}" "$IP"
  fi
done

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && ufw allow 443/udp >/dev/null
fi

say "Building Shopistan (takes a few minutes the first time)"
# shellcheck disable=SC2086
docker build -q ${BUILD_FLAGS:-} --build-arg "NEXT_PUBLIC_MERCHANT_URL=https://app.$DOMAIN" -t shopistan:latest "$DIR" >/dev/null

say "Starting"
"${COMPOSE[@]}" up -d --remove-orphans

for _ in $(seq 1 60); do
  state="$("${COMPOSE[@]}" ps -a --format '{{.Service}} {{.State}} {{.ExitCode}}')"
  if echo "$state" | grep -q '^setup exited [1-9]'; then
    "${COMPOSE[@]}" logs setup | tail -30
    fail "Database setup failed (see above)."
  fi
  if echo "$state" | grep -q '^setup exited 0' && "${COMPOSE[@]}" ps api --format '{{.Health}}' | grep -q healthy; then
    break
  fi
  sleep 5
done
"${COMPOSE[@]}" ps api --format '{{.Health}}' | grep -q healthy || fail "Shopistan did not start. Run: ${COMPOSE[*]} logs"

CREDS=/root/shopistan-login.txt
cat > "$CREDS" <<INFO
Shopistan is running.

  Marketing site   https://$DOMAIN
  Create a store   https://app.$DOMAIN/signup
  Merchant login   https://app.$DOMAIN/login
  Super Admin      https://admin.$DOMAIN
    email          $(get PLATFORM_ADMIN_EMAIL)
    password       $(get PLATFORM_ADMIN_PASSWORD)

Settings and secrets: $ENV_FILE (keep a copy of ENCRYPTION_KEY).
Update later by running the install command again.
INFO
chmod 600 "$CREDS"
say "Done"
cat "$CREDS"
echo "(Saved to $CREDS)"
