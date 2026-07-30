#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

HOST=""
USER_NAME="quizup"
SSH_PORT="22"
SSH_IDENTITY=""
REMOTE_DIR="/opt/your-app"
REMOTE_ENV_FILE=".env.production.ready"
COMPOSE_FILE="docker/docker-compose.prod.yml"
BACKUP_ROOT=""
SKIP_HEALTH="false"
KEEP_PACKAGE="false"

usage() {
  cat <<'EOF'
Usage: scripts/deploy-vps-clean.sh --host <ip-or-host> [options]

Required:
  --host, -H              VPS hostname or IP

Optional:
  --user, -u              SSH user (default: quizup)
  --port, -p              SSH port (default: 22)
  --identity, -i          SSH private key path
  --remote-dir, -r        Remote app directory (default: /opt/your-app)
  --env-file, -e          Remote env file used by docker compose (default: .env.production.ready)
  --compose-file, -c      Compose file path relative to remote dir (default: docker/docker-compose.prod.yml)
  --backup-root, -b       Remote backup root (default: /home/<user>/deploy-backups)
  --skip-health           Skip HTTP/Nakama health checks at the end
  --keep-package          Keep local /tmp package after deployment
  --help, -h              Show this help

Authentication:
  - SSH key: use --identity
  - Password: export SSHPASS='your_password' and ensure sshpass is installed

Example:
  SSHPASS='your_password' bash scripts/deploy-vps-clean.sh \
    --host 203.0.113.10 \
    --user quizup \
    --remote-dir /opt/your-app
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host|-H)
      HOST="${2:-}"
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
      REMOTE_ENV_FILE="${2:-}"
      shift 2
      ;;
    --compose-file|-c)
      COMPOSE_FILE="${2:-}"
      shift 2
      ;;
    --backup-root|-b)
      BACKUP_ROOT="${2:-}"
      shift 2
      ;;
    --skip-health)
      SKIP_HEALTH="true"
      shift
      ;;
    --keep-package)
      KEEP_PACKAGE="true"
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

if [[ -z "$BACKUP_ROOT" ]]; then
  BACKUP_ROOT="/home/${USER_NAME}/deploy-backups"
fi

for cmd in ssh scp tar; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

USE_SSHPASS="false"
if [[ -n "${SSHPASS:-}" ]]; then
  if ! command -v sshpass >/dev/null 2>&1; then
    echo "SSHPASS is set but sshpass is not installed." >&2
    echo "Install sshpass or use SSH key auth with --identity." >&2
    exit 1
  fi
  USE_SSHPASS="true"
fi

# Force TTY so remote sudo prompts can be handled when passwordless sudo isn't configured.
SSH_OPTS=(-tt -p "$SSH_PORT" -o StrictHostKeyChecking=accept-new)
SCP_OPTS=(-P "$SSH_PORT" -o StrictHostKeyChecking=accept-new)
if [[ -n "$SSH_IDENTITY" ]]; then
  SSH_OPTS+=(-i "$SSH_IDENTITY")
  SCP_OPTS+=(-i "$SSH_IDENTITY")
fi

run_ssh() {
  if [[ "$USE_SSHPASS" == "true" ]]; then
    sshpass -e ssh "${SSH_OPTS[@]}" "$@"
  else
    ssh "${SSH_OPTS[@]}" "$@"
  fi
}

run_scp() {
  if [[ "$USE_SSHPASS" == "true" ]]; then
    sshpass -e scp "${SCP_OPTS[@]}" "$@"
  else
    scp "${SCP_OPTS[@]}" "$@"
  fi
}

TARGET="${USER_NAME}@${HOST}"
STAMP="$(date +%Y%m%d-%H%M%S)"
PACKAGE_NAME="beneficial-knowledge-full-refresh-${STAMP}.tgz"
LOCAL_PACKAGE="/tmp/${PACKAGE_NAME}"
REMOTE_PACKAGE="/home/${USER_NAME}/${PACKAGE_NAME}"

cleanup() {
  if [[ "$KEEP_PACKAGE" != "true" && -n "${LOCAL_PACKAGE:-}" && -f "$LOCAL_PACKAGE" ]]; then
    rm -f "$LOCAL_PACKAGE"
  fi
}
trap cleanup EXIT

echo "[1/5] Creating deploy package: $LOCAL_PACKAGE"
tar -czf "$LOCAL_PACKAGE" \
  --exclude-from "scripts/rsync-excludes.txt" \
  --exclude ".env*" \
  --exclude ".git" \
  --exclude ".idea" \
  --exclude "*.pid*" \
  --exclude "*.tmp" \
  .

echo "[2/5] Uploading package to ${TARGET}:${REMOTE_PACKAGE}"
run_scp "$LOCAL_PACKAGE" "${TARGET}:${REMOTE_PACKAGE}"

echo "[3/5] Running remote clean deployment..."
run_ssh "$TARGET" \
  "bash -s -- $(printf '%q ' "$REMOTE_PACKAGE" "$REMOTE_DIR" "$REMOTE_ENV_FILE" "$COMPOSE_FILE" "$BACKUP_ROOT" "$SKIP_HEALTH")" <<'EOSSH'
set -euo pipefail

REMOTE_PACKAGE="$1"
REMOTE_DIR="$2"
REMOTE_ENV_FILE="$3"
COMPOSE_FILE="$4"
BACKUP_ROOT="$5"
SKIP_HEALTH="$6"

STAMP="$(date +%Y%m%d-%H%M%S)"
RELEASE_DIR="/home/${USER}/releases/full-${STAMP}"
BACKUP_DIR="${BACKUP_ROOT}/${STAMP}"
BACKUP_TGZ="${BACKUP_DIR}/full-before-update.tgz"

mkdir -p "$(dirname "$RELEASE_DIR")"
mkdir -p "$BACKUP_DIR"

if [[ -d "$REMOTE_DIR" ]] && [[ -n "$(ls -A "$REMOTE_DIR" 2>/dev/null || true)" ]]; then
  echo "Creating rollback backup: $BACKUP_TGZ"
  tar -czf "$BACKUP_TGZ" -C "$REMOTE_DIR" .
  cp -f "$REMOTE_DIR"/.env* "$BACKUP_DIR"/ 2>/dev/null || true
else
  echo "No existing app state found at $REMOTE_DIR, skipping full backup archive."
fi

echo "Extracting release to $RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
tar -xzf "$REMOTE_PACKAGE" -C "$RELEASE_DIR"
rm -f "$REMOTE_PACKAGE"

echo "Syncing release into $REMOTE_DIR"
sudo mkdir -p "$REMOTE_DIR"
sudo rsync -rltD --delete \
  --exclude ".env" \
  --exclude ".env.production" \
  --exclude ".env.production.ready" \
  --exclude "node_modules" \
  --exclude "client/node_modules" \
  --exclude "admin/node_modules" \
  --exclude "server/node_modules" \
  --exclude "client/dist" \
  --exclude "admin/dist" \
  --exclude "server/build" \
  "$RELEASE_DIR"/ "$REMOTE_DIR"/

if [[ ! -f "$REMOTE_DIR/$REMOTE_ENV_FILE" ]]; then
  echo "Missing remote env file: $REMOTE_DIR/$REMOTE_ENV_FILE" >&2
  exit 1
fi

echo "Rebuilding Nakama runtime bundle..."
cd "$REMOTE_DIR/server"
npm ci
npm run build

echo "Running DB/app migrations..."
cd "$REMOTE_DIR"
sudo docker compose --env-file "$REMOTE_ENV_FILE" -f "$COMPOSE_FILE" run --rm app-migrations

echo "Recreating client and admin containers..."
sudo docker compose --env-file "$REMOTE_ENV_FILE" -f "$COMPOSE_FILE" up -d --build --force-recreate client admin

echo "Restarting Nakama..."
sudo docker compose --env-file "$REMOTE_ENV_FILE" -f "$COMPOSE_FILE" restart nakama

echo "Container status:"
sudo docker compose --env-file "$REMOTE_ENV_FILE" -f "$COMPOSE_FILE" ps

if [[ "$SKIP_HEALTH" != "true" ]]; then
  echo "Health checks:"
  curl -fsS http://127.0.0.1:8080 >/dev/null && echo "client_ok"
  curl -fsS http://127.0.0.1:3002 >/dev/null && echo "admin_ok"
  curl -fsS http://127.0.0.1:7350/healthcheck >/dev/null && echo "nakama_ok"
fi

echo "Recent Nakama startup lines:"
sudo docker compose --env-file "$REMOTE_ENV_FILE" -f "$COMPOSE_FILE" logs --since 5m nakama \
  | grep -E "Registered JavaScript runtime RPC function invocation|Startup done" \
  | tail -n 20 || true

echo "Backup saved at: $BACKUP_DIR"
echo "Release extracted at: $RELEASE_DIR"
EOSSH

echo "[4/5] Deployment finished."
if [[ "$KEEP_PACKAGE" == "true" ]]; then
  echo "Local package retained: $LOCAL_PACKAGE"
fi
echo "[5/5] Done."
