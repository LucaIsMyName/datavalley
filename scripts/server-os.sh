#!/usr/bin/env bash

# /etc/os-release values are sometimes quoted. Docker's apt repo and the
# package install both need the raw id and codename.
server_os_value() {
  local key="$1"
  local file="${2:-/etc/os-release}"
  local line value
  line="$(grep -E "^${key}=" "$file" | head -n 1 || true)"
  value="${line#"${key}"=}"
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"
  printf '%s\n' "$value"
}

server_os_id() {
  local file="${1:-/etc/os-release}"
  local id
  id="$(server_os_value ID "$file")"
  # tr keeps this working on the Bash 3.2 that ships with macOS, where the tests run.
  printf '%s\n' "$id" | tr '[:upper:]' '[:lower:]'
}

assert_supported_server_os() {
  local file="${1:-/etc/os-release}"
  if [[ ! -f "$file" ]]; then
    echo "This deploy installs packages on Ubuntu or Debian." >&2
    return 1
  fi
  case "$(server_os_id "$file")" in
    ubuntu|debian) return 0 ;;
  esac
  echo "This deploy installs packages on Ubuntu or Debian." >&2
  return 1
}
