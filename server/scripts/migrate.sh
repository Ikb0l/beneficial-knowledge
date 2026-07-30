#!/usr/bin/env sh
set -eu

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-nakama}"
DB_USER="${DB_USER:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-${POSTGRES_PASSWORD:-localdb}}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")/../migrations" && pwd)}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql command not found. Install PostgreSQL client tools or run migrations via Docker." >&2
  exit 1
fi

found=0
export PGPASSWORD="$DB_PASSWORD"
for file in "$MIGRATIONS_DIR"/*.sql; do
  if [ ! -f "$file" ]; then
    continue
  fi
  found=1
  echo "Applying app migration $(basename "$file")..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$file"
done
unset PGPASSWORD

if [ "$found" -eq 0 ]; then
  echo "No migration files found in $MIGRATIONS_DIR" >&2
  exit 1
fi

echo "All app migrations applied successfully."
