#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_OUTPUT_FILE=".env.production.ready"
DOMAIN=""
PREPARE_ONLY="false"

usage() {
  cat <<'EOF'
Usage: scripts/deploy-production.sh [--domain <domain>] [--prepare-only]

Options:
  --domain, -d      Domain to write into prepared env (e.g. example.com)
  --prepare-only    Prepare env + security check only, skip build/deploy
  --help, -h        Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain|-d)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for $1" >&2
        usage
        exit 1
      fi
      DOMAIN="$2"
      shift 2
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

prepare_args=(scripts/prepare-production-env.mjs --output "$ENV_OUTPUT_FILE")
if [[ -n "$DOMAIN" ]]; then
  prepare_args+=(--domain "$DOMAIN")
fi

echo "Preparing production environment file..."
node "${prepare_args[@]}"

echo "Running production env security check..."
node scripts/check-env-security.mjs --env-file "$ENV_OUTPUT_FILE"

if [[ "$PREPARE_ONLY" == "true" ]]; then
  echo "PrepareOnly mode enabled. Skipping build and docker deployment."
  echo "Env file generated: $ENV_OUTPUT_FILE"
  exit 0
fi

echo "Building Nakama runtime bundle..."
npm run server:build

read_env_value() {
  local key="$1"
  local file="$2"
  local line
  line="$(grep -E "^${key}=" "$file" | head -n 1 || true)"
  if [[ -z "$line" ]]; then
    echo ""
    return
  fi
  echo "${line#*=}" | tr -d '\r'
}

tunnel_enabled="$(read_env_value "CLOUDFLARE_TUNNEL_ENABLED" "$ENV_OUTPUT_FILE" | tr '[:upper:]' '[:lower:]')"
tunnel_token="$(read_env_value "CLOUDFLARE_TUNNEL_TOKEN" "$ENV_OUTPUT_FILE")"

compose_args=(--env-file "$ENV_OUTPUT_FILE" -f docker/docker-compose.prod.yml)
if [[ "$tunnel_enabled" == "true" ]]; then
  if [[ -z "$tunnel_token" ]]; then
    echo "CLOUDFLARE_TUNNEL_ENABLED=true but CLOUDFLARE_TUNNEL_TOKEN is empty." >&2
    exit 1
  fi
  echo "Cloudflare named tunnel profile enabled."
  compose_args+=(--profile tunnel)
fi
compose_args+=(up -d --build)

echo "Starting production docker stack..."
docker compose "${compose_args[@]}"

echo "Production deployment finished successfully."
echo "Env file used: $ENV_OUTPUT_FILE"
