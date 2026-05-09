#!/usr/bin/env bash
# Restaura un SQL completo o parcial contra DATABASE_URL (staging/backup; no usar en prod sin snapshot).
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Missing DATABASE_URL"
  echo "Usage: DATABASE_URL='postgresql://...' ./scripts/restore-db.sh backups/archivo.sql"
  exit 1
fi

if [ -z "${1:-}" ]; then
  echo "Missing backup file"
  echo "Usage: ./scripts/restore-db.sh backups/archivo.sql"
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "Restoring from $BACKUP_FILE..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$BACKUP_FILE"
echo "Restore completed."
