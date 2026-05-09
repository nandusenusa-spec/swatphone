#!/usr/bin/env bash
# Backup schema + data desde Postgres (Supabase). Requiere DATABASE_URL o uso de Supabase CLI.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${ROOT}/backups"
mkdir -p "${BACKUP_DIR}"

DATE="$(date +"%Y-%m-%d_%H-%M-%S")"
PREFIX="${BACKUP_DIR}/${DATE}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Missing DATABASE_URL"
  echo "Usage: DATABASE_URL='postgresql://...' ./scripts/backup-db.sh"
  exit 1
fi

echo "Creating backups with timestamp ${DATE}..."

if command -v supabase >/dev/null 2>&1; then
  echo "Using Supabase CLI (schema)..."
  supabase db dump --db-url "$DATABASE_URL" --file "${PREFIX}_schema.sql"
  echo "Using Supabase CLI (data only)..."
  supabase db dump --db-url "$DATABASE_URL" --data-only --file "${PREFIX}_data.sql"
elif command -v pg_dump >/dev/null 2>&1; then
  echo "supabase CLI not found; using pg_dump..."
  pg_dump "$DATABASE_URL" --schema-only --no-owner --no-acl -f "${PREFIX}_schema.sql"
  pg_dump "$DATABASE_URL" --data-only --no-owner --no-acl -f "${PREFIX}_data.sql"
else
  echo "Install Supabase CLI (https://supabase.com/docs/guides/cli) or PostgreSQL client tools (pg_dump)."
  exit 1
fi

echo "Backup completed:"
echo "  ${PREFIX}_schema.sql"
echo "  ${PREFIX}_data.sql"
