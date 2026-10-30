#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${DATABASE_URL:-}" || -z "${MEDIA_ROOT:-}" ]]; then
  echo "DATABASE_URL and MEDIA_ROOT are required" >&2
  exit 1
fi
dump="${1:-}"
media="${2:-}"
if [[ -z "$dump" ]]; then
  echo "Usage: restore.sh <db.dump> [media.tar.gz]" >&2
  exit 1
fi
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$dump"
if [[ -n "$media" ]]; then
  mkdir -p "$MEDIA_ROOT"
  tar -xzf "$media" -C "$MEDIA_ROOT"
fi
echo "Restore finished"
