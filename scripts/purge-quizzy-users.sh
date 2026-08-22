#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_FILE="$ROOT_DIR/scripts/sql/purge-quizzy-users.sql"

HOST=""
USER_NAME="quizup"
SSH_PORT="22"
SSH_IDENTITY=""
MODE="dry-run"
CONTAINER="beneficial-knowledge-postgres-prod"
DB_NAME="nakama"
DB_USER="postgres"
REMOTE_SQL_PATH=""

usage() {
  cat <<'EOF'
Usage: scripts/purge-quizzy-users.sh --host <ip-or-host> [options]

Required:
  --host, -H               VPS hostname or IP

Optional:
  --user, -u               SSH user (default: quizup)
  --port, -p               SSH port (default: 22)
  --identity, -i           SSH private key path
  --mode, -m               dry-run|apply (default: dry-run)
  --container, -c          Postgres container name (default: beneficial-knowledge-postgres-prod)
  --db, -d                 Database name (default: nakama)
  --db-user                Postgres user (default: postgres)
  --help, -h               Show this help

Environment variables:
  SSHPASS                  SSH password for password-based auth (requires sshpass)
  SUDO_PASS                Remote sudo password. If unset, script requires passwordless sudo.

Examples:
  SSHPASS='...' SUDO_PASS='...' \
    bash scripts/purge-quizzy-users.sh --host 46.8.176.30 --mode dry-run

  SSHPASS='...' SUDO_PASS='...' \
    bash scripts/purge-quizzy-users.sh --host 46.8.176.30 --mode apply
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
    --mode|-m)
      MODE="${2:-}"
      shift 2
      ;;
    --container|-c)
      CONTAINER="${2:-}"
      shift 2
      ;;
    --db|-d)
      DB_NAME="${2:-}"
      shift 2
      ;;
    --db-user)
      DB_USER="${2:-}"
      shift 2
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

if [[ "$MODE" != "dry-run" && "$MODE" != "apply" ]]; then
  echo "--mode must be dry-run or apply." >&2
  exit 1
fi

if [[ ! -f "$SQL_FILE" ]]; then
  echo "SQL file not found: $SQL_FILE" >&2
  exit 1
fi

for cmd in ssh scp; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

USE_SSHPASS="false"
if [[ -n "${SSHPASS:-}" ]]; then
  if ! command -v sshpass >/dev/null 2>&1; then
    echo "SSHPASS is set but sshpass is not installed." >&2
    exit 1
  fi
  USE_SSHPASS="true"
fi

SSH_OPTS=(-p "$SSH_PORT" -o StrictHostKeyChecking=accept-new)
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

q() {
  printf '%q' "$1"
}

TARGET="${USER_NAME}@${HOST}"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
BACKUP_SUFFIX="$STAMP"
REMOTE_SQL_PATH="/tmp/purge-quizzy-users-${STAMP}.sql"

SUDO_PREFIX="sudo -n"
if [[ -n "${SUDO_PASS:-}" ]]; then
  SUDO_PREFIX="echo $(q "$SUDO_PASS") | sudo -S -p ''"
fi

cleanup_remote_sql() {
  if [[ -n "$REMOTE_SQL_PATH" ]]; then
    run_ssh "$TARGET" "rm -f $(q "$REMOTE_SQL_PATH")" >/dev/null 2>&1 || true
  fi
}
trap cleanup_remote_sql EXIT

echo "[1/5] Checking SSH connectivity..."
run_ssh "$TARGET" "echo connected >/dev/null"

echo "[2/5] Validating sudo access..."
if ! run_ssh "$TARGET" "$SUDO_PREFIX true"; then
  echo "Remote sudo failed." >&2
  echo "Set SUDO_PASS environment variable or configure passwordless sudo." >&2
  exit 1
fi

echo "[3/5] Validating docker container: $CONTAINER"
run_ssh "$TARGET" "$SUDO_PREFIX docker ps --format '{{.Names}}' | grep -Fx $(q "$CONTAINER") >/dev/null"

echo "[4/5] Uploading SQL script to remote host: $REMOTE_SQL_PATH"
run_scp "$SQL_FILE" "${TARGET}:${REMOTE_SQL_PATH}"

APPLY_FLAG="0"
if [[ "$MODE" == "apply" ]]; then
  APPLY_FLAG="1"
fi

echo "[5/5] Executing purge SQL in mode=$MODE (backup_suffix=$BACKUP_SUFFIX)"
run_ssh "$TARGET" \
  "cat $(q "$REMOTE_SQL_PATH") | $SUDO_PREFIX docker exec -i $(q "$CONTAINER") psql -U $(q "$DB_USER") -d $(q "$DB_NAME") -v ON_ERROR_STOP=1 -v apply=$(q "$APPLY_FLAG") -v backup_suffix=$(q "$BACKUP_SUFFIX") -f -"

echo "Completed purge script in mode=$MODE."
if [[ "$MODE" == "apply" ]]; then
  echo "Backups stored in schema cleanup_backup with suffix: $BACKUP_SUFFIX"
fi
