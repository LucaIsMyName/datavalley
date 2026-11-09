#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${DATABASE_URL:-}" || -z "${MEDIA_ROOT:-}" ]]; then
  echo "DATABASE_URL and MEDIA_ROOT are required" >&2
  exit 1
fi
keep_days="${BACKUP_KEEP_DAYS:-}"
if [[ -n "$keep_days" && ! "$keep_days" =~ ^[1-9][0-9]*$ ]]; then
  echo "BACKUP_KEEP_DAYS must be a positive number of days" >&2
  exit 1
fi
out="${1:-./backups}"
mkdir -p "$out"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="$out/datavalley-$stamp.dump"
media="$out/media-$stamp.tar.gz"

pg_dump --format=custom --dbname="$DATABASE_URL" --file="$dump"
# A dump that pg_restore cannot read is no backup, so fail now rather than at restore time.
if ! pg_restore --list "$dump" >/dev/null; then
  echo "The database dump in $dump cannot be read back" >&2
  exit 1
fi
written=("$dump")
if [[ -d "$MEDIA_ROOT" ]]; then
  tar -czf "$media" -C "$MEDIA_ROOT" .
  written+=("$media")
fi

if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
  for file in "${written[@]}"; do
    openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -in "$file" -out "$file.enc"
    rm -f "$file"
  done
fi

if [[ -n "$keep_days" ]]; then
  find "$out" -maxdepth 1 -type f \( -name 'datavalley-*' -o -name 'media-*' \) -mtime +"$keep_days" -delete
fi
echo "Wrote backup to $out"
