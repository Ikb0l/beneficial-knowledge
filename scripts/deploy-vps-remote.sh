#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

HOST=""
USER_NAME="ubuntu"
SSH_PORT="22"
SSH_IDENTITY=""
DOMAIN=""
REMOTE_DIR="/opt/beneficial-knowledge"
ENV_FILE=".env.production"
BOOTSTRAP="false"
SETUP_CADDY="false"
PREPARE_ONLY="false"
NO_ENV_COPY="false"
RSYNC_EXCLUDES_FILE="scripts/rsync-excludes.txt"

usage() {
  cat <<'EOF'
Usage: scripts/deploy-vps-remote.sh --host <ip-or-host> --domain <domain> [options]

Required:
  --host, -H            VPS hostname or IP
  --domain, -d          Root domain, e.g. example.com

Optional:
  --user, -u            SSH user (default: ubuntu)
  --port, -p            SSH port (default: 22)
  --identity, -i        SSH private key path
  --remote-dir, -r      Remote project directory (default: /opt/beneficial-knowledge)
  --env-file, -e        Local env file to upload as .env.production (default: .env.production)
  --no-env-copy         Do not upload local env file
  --bootstrap           Run VPS package bootstrap (Docker/Node/cloudflared)
  --setup-caddy         Configure HTTPS reverse proxy (app/admin/api subdomains)
  --prepare-only        Prepare env + security check only on VPS, skip docker deployment
  --help, -h            Show this help

Example:
  bash scripts/deploy-vps-remote.sh \
    --host 203.0.113.10 \
    --user ubuntu \
    --identity ~/.ssh/id_ed25519 \
    --domain example.com \
    --bootstrap \
    --setup-caddy
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host|-H)
      HOST="${2:-}"
      shift 2
      ;;
    --domain|-d)
      DOMAIN="${2:-}"
      shift 2
      ;;
    --user|-u)
      USER_NAME="${2:-}"
      shift 2
      ;;
    --port|-p)
      SSH_PORT="${2:-}"
      shift 2
      ;;
    --identity|-i)
      SSH_IDENTITY="${2:-}"
      shift 2
      ;;
    --remote-dir|-r)
      REMOTE_DIR="${2:-}"
      shift 2
      ;;
    --env-file|-e)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --no-env-copy)
      NO_ENV_COPY="true"
      shift
      ;;
    --bootstrap)
      BOOTSTRAP="true"
      shift
      ;;
    --setup-caddy)
      SETUP_CADDY="true"
      shift
      ;;
    --prepare-only)
      PREPARE_ONLY="true"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$HOST" ]]; then
  echo "--host is required." >&2
  usage
  exit 1
fi

if [[ -z "$DOMAIN" ]]; then
  echo "--domain is required." >&2
  usage
  exit 1
fi

if [[ "$NO_ENV_COPY" != "true" && ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  echo "Create it first or pass --no-env-copy." >&2
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh command not found." >&2
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync command not found." >&2
  exit 1
fi

if [[ ! -f "$RSYNC_EXCLUDES_FILE" ]]; then
  echo "Missing rsync excludes file: $RSYNC_EXCLUDES_FILE" >&2
  exit 1
fi

SSH_OPTS=(-p "$SSH_PORT")
if [[ -n "$SSH_IDENTITY" ]]; then
  SSH_OPTS+=(-i "$SSH_IDENTITY")
fi
SSH_OPTS+=(-o StrictHostKeyChecking=accept-new)

RSYNC_SSH_CMD=""
for arg in "${SSH_OPTS[@]}"; do
  RSYNC_SSH_CMD+="$(printf '%q ' "$arg")"
done

TARGET="${USER_NAME}@${HOST}"

echo "[1/5] Creating remote directory: $REMOTE_DIR"
ssh "${SSH_OPTS[@]}" "$TARGET" "mkdir -p \"$REMOTE_DIR\""

echo "[2/5] Syncing project files to VPS..."
rsync -az --delete \
  --exclude-from "$RSYNC_EXCLUDES_FILE" \
  -e "ssh ${RSYNC_SSH_CMD}" \
  "./" "${TARGET}:${REMOTE_DIR}/"

if [[ "$NO_ENV_COPY" != "true" ]]; then
  echo "[3/5] Uploading env file -> ${REMOTE_DIR}/.env.production"
  scp "${SSH_OPTS[@]}" "$ENV_FILE" "${TARGET}:${REMOTE_DIR}/.env.production"
else
  echo "[3/5] Skipping env upload (--no-env-copy)."
fi

echo "[4/5] Running remote deploy commands..."
ssh "${SSH_OPTS[@]}" "$TARGET" "bash -s -- $(printf '%q ' "$REMOTE_DIR" "$DOMAIN" "$BOOTSTRAP" "$SETUP_CADDY" "$PREPARE_ONLY")" <<'EOSSH'
set -euo pipefail

REMOTE_DIR="$1"
DOMAIN="$2"
DO_BOOTSTRAP="$3"
DO_SETUP_CADDY="$4"
DO_PREPARE_ONLY="$5"

cd "$REMOTE_DIR"

# Remove stale local-only artifacts that may remain from older deploys.
rm -rf .idea .runlogs logs tests docs node_modules client/node_modules admin/node_modules server/node_modules

if [[ "$DO_BOOTSTRAP" == "true" ]]; then
  if command -v sudo >/dev/null 2>&1; then
    sudo bash scripts/bootstrap-ubuntu-vps.sh
  elif [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    bash scripts/bootstrap-ubuntu-vps.sh
  else
    echo "Bootstrap requested but sudo is unavailable." >&2
    exit 1
  fi
fi

echo "Installing server build dependencies..."
npm --prefix server ci

if [[ "$DO_PREPARE_ONLY" == "true" ]]; then
  bash scripts/deploy-production.sh --domain "$DOMAIN" --prepare-only
else
  bash scripts/deploy-production.sh --domain "$DOMAIN"
fi

if [[ "$DO_SETUP_CADDY" == "true" ]]; then
  if command -v sudo >/dev/null 2>&1; then
    sudo bash scripts/setup-caddy-reverse-proxy.sh "$DOMAIN"
  elif [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    bash scripts/setup-caddy-reverse-proxy.sh "$DOMAIN"
  else
    echo "Caddy setup requested but sudo is unavailable." >&2
    exit 1
  fi
fi
EOSSH

echo "[5/5] Deployment complete."
echo "Client: https://app.${DOMAIN}"
echo "Admin:  https://admin.${DOMAIN}"
echo "API:    https://api.${DOMAIN}"
