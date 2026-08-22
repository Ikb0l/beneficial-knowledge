#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-quizupuz.chat}"
APP_HOST="${APP_HOST:-app.${DOMAIN}}"
ADMIN_HOST="${ADMIN_HOST:-admin.${DOMAIN}}"
API_HOST="${API_HOST:-api.${DOMAIN}}"

CLIENT_PORT="${CLIENT_PORT:-8080}"
ADMIN_PORT="${ADMIN_PORT:-3002}"
API_PORT="${API_PORT:-7350}"

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

echo "Installing Caddy (if missing)..."
if ! command -v caddy >/dev/null 2>&1; then
  ${SUDO} apt-get update -y
  ${SUDO} apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | ${SUDO} gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | ${SUDO} tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  ${SUDO} apt-get update -y
  ${SUDO} apt-get install -y caddy
else
  echo "Caddy already installed."
fi

echo "Writing /etc/caddy/Caddyfile ..."
${SUDO} tee /etc/caddy/Caddyfile >/dev/null <<EOF
{
  email admin@${DOMAIN}
}

${APP_HOST} {
  encode gzip zstd
  reverse_proxy 127.0.0.1:${CLIENT_PORT}
}

${ADMIN_HOST} {
  encode gzip zstd
  reverse_proxy 127.0.0.1:${ADMIN_PORT}
}

${API_HOST} {
  reverse_proxy 127.0.0.1:${API_PORT}
}
EOF

${SUDO} caddy fmt --overwrite /etc/caddy/Caddyfile
${SUDO} systemctl enable caddy
${SUDO} systemctl restart caddy

echo "Caddy is configured."
echo "Routes:"
echo "  https://${APP_HOST}   -> 127.0.0.1:${CLIENT_PORT}"
echo "  https://${ADMIN_HOST} -> 127.0.0.1:${ADMIN_PORT}"
echo "  https://${API_HOST}   -> 127.0.0.1:${API_PORT}"
