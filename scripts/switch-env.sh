#!/usr/bin/env bash
# Copia una plantilla de entorno a .env.local con confirmación (no sobrescribe sin aviso).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${ROOT}/.env.local"

usage() {
  echo "Usage: ./scripts/switch-env.sh <local|backup|demo>"
  echo "  local  — desde .env.local.example"
  echo "  backup — desde .env.backup.example"
  echo "  demo   — desde .env.demo.example"
  exit 1
}

[ "${1:-}" ] || usage

MODE="$1"
case "$MODE" in
  local) SRC="${ROOT}/.env.local.example" ;;
  backup) SRC="${ROOT}/.env.backup.example" ;;
  demo) SRC="${ROOT}/.env.demo.example" ;;
  *) usage ;;
esac

if [ ! -f "$SRC" ]; then
  echo "Missing template: $SRC"
  exit 1
fi

if [ -f "$TARGET" ]; then
  echo "Ya existe: $TARGET"
  read -r -p "¿Sobrescribir? [y/N] " ans
  case "$ans" in
    y|Y|yes|YES) ;;
    *) echo "Cancelado."; exit 0 ;;
  esac
fi

cp "$SRC" "$TARGET"
echo "Escrito $TARGET desde $SRC"
echo "Editá valores secretos antes de correr la app."
