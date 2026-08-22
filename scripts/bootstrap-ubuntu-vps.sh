#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run as root (or with sudo)." >&2
  exit 1
fi

TARGET_USER="${SUDO_USER:-}"

echo "[1/5] Installing base packages..."
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release git jq

echo "[2/5] Installing Docker..."
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  . /etc/os-release
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    | tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo "Docker already installed, skipping."
fi

systemctl enable docker
systemctl restart docker

if [[ -n "$TARGET_USER" ]]; then
  usermod -aG docker "$TARGET_USER" || true
fi

echo "[3/5] Installing Node.js 20..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
else
  CURRENT_NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
  if [[ "$CURRENT_NODE_MAJOR" -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  else
    echo "Node.js $(node -v) already installed, skipping."
  fi
fi

echo "[4/5] Installing cloudflared..."
if ! command -v cloudflared >/dev/null 2>&1; then
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
    | tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
    | tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
  apt-get update -y
  apt-get install -y cloudflared
else
  echo "cloudflared already installed, skipping."
fi

echo "[5/5] Opening basic firewall ports (SSH/HTTP/HTTPS)..."
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
fi

echo "Bootstrap complete."
echo "If docker group was updated, re-login before running docker commands."
