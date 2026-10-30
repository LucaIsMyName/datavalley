#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${DATABASE_URL:-}" || -z "${MEDIA_ROOT:-}" ]]; then
  echo "DATABASE_URL and MEDIA_ROOT are required" >&2
  exit 1
fi
out="${1:-./backups}"
mkdir -p "$out"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
pg_dump --format=custom --dbname="$DATABASE_URL" --file="$out/datavalley-$stamp.dump"
if [[ -d "$MEDIA_ROOT" ]]; then
  tar -czf "$out/media-$stamp.tar.gz" -C "$MEDIA_ROOT" .
fi
echo "Wrote backup to $out"
