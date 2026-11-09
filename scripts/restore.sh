#!/usr/bin/env bash
set -euo pipefail
if [[ -z "${DATABASE_URL:-}" || -z "${MEDIA_ROOT:-}" ]]; then
  echo "DATABASE_URL and MEDIA_ROOT are required" >&2
  exit 1
fi
dump="${1:-}"
media="${2:-}"
if [[ -z "$dump" ]]; then
  echo "Usage: restore.sh <db.dump[.enc]> [media.tar.gz[.enc]]" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Backups written with BACKUP_PASSPHRASE end in .enc and are decrypted into a temporary copy first.
readable() {
  local file="$1"
  if [[ "$file" != *.enc ]]; then
    echo "$file"
    return
  fi
  if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
    echo "BACKUP_PASSPHRASE is required to restore $file" >&2
    exit 1
  fi
  local plain
  plain="$work/$(basename "${file%.enc}")"
  openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$file" -out "$plain"
  echo "$plain"
}

dump_file="$(readable "$dump")"
media_file=""
if [[ -n "$media" ]]; then
  media_file="$(readable "$media")"
fi
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$dump_file"
if [[ -n "$media_file" ]]; then
  mkdir -p "$MEDIA_ROOT"
  tar -xzf "$media_file" -C "$MEDIA_ROOT"
fi
echo "Restore finished"
