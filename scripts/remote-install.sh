#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_PATH:?DEPLOY_PATH is required}"
: "${RELEASE_STAMP:?RELEASE_STAMP is required}"
: "${APP_USER:?APP_USER is required}"
: "${DOMAIN:?DOMAIN is required}"
: "${API_PORT:?API_PORT is required}"

if [[ ! "$RELEASE_STAMP" =~ ^[0-9]{14}$ ]]; then
  echo "RELEASE_STAMP must be YYYYMMDDHHMMSS." >&2
  exit 1
fi

RELEASE_DIR="${DEPLOY_PATH}/releases/${RELEASE_STAMP}"
SHARED_DIR="${DEPLOY_PATH}/shared"
CURRENT_LINK="${DEPLOY_PATH}/current"
previous_release=""

if [[ ! -f /etc/os-release ]] || ! grep -qi '^ID=ubuntu' /etc/os-release; then
  echo "This deploy installs packages on Ubuntu." >&2
  exit 1
fi

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=()
else
  SUDO=(sudo -n)
fi

run() {
  if [[ ${#SUDO[@]} -eq 0 ]]; then
    "$@"
  else
    "${SUDO[@]}" "$@"
  fi
}

export DEBIAN_FRONTEND=noninteractive
run apt-get update
run apt-get install -y ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https

public_ip="$(curl -4 -fsS https://ifconfig.me || curl -4 -fsS https://api.ipify.org)"
resolved="$(getent ahostsv4 "$DOMAIN" | awk '{print $1; exit}')"
if [[ -z "$resolved" || "$public_ip" != "$resolved" ]]; then
  echo "DOMAIN ${DOMAIN} resolves to '${resolved:-nothing}', and this server's public IPv4 is ${public_ip}." >&2
  exit 1
fi

if ! run apt-get install -y postgresql-16; then
  run install -d /usr/share/postgresql-common/pgdg
  run curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
  codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${codename}-pgdg main" | run tee /etc/apt/sources.list.d/pgdg.list >/dev/null
  run apt-get update
  run apt-get install -y postgresql-16
fi
run systemctl enable --now postgresql

if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | run bash -
  run apt-get install -y nodejs
fi
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) process.exit(1)' || {
  echo "Node.js 22 or newer is required on the server." >&2
  exit 1
}

if ! command -v caddy >/dev/null 2>&1; then
  run rm -f /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | run gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | run tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  run apt-get update
  run apt-get install -y caddy
fi

if [[ ! -f "$RELEASE_DIR/package.json" ]]; then
  echo "Release ${RELEASE_DIR} is missing." >&2
  exit 1
fi

env_file="${SHARED_DIR}/.env"
if [[ ! -f "$env_file" && -f "$DEPLOY_PATH/.env" ]]; then
  env_file="$DEPLOY_PATH/.env"
fi
if [[ ! -f "$env_file" ]]; then
  echo "Missing ${SHARED_DIR}/.env" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

if [[ -n "${REDIS_URL:-}" ]]; then
  run apt-get install -y redis-server
  run systemctl enable --now redis-server || run systemctl enable --now redis
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  run useradd --system --home-dir "$DEPLOY_PATH" --shell /usr/sbin/nologin "$APP_USER"
fi

node --input-type=module <<'NODE'
import { writeFileSync } from 'node:fs'
const raw = process.env.DATABASE_URL ?? ''
if (!/^postgres(ql)?:\/\//.test(raw)) {
  console.error('DATABASE_URL must be a postgres:// URL')
  process.exit(1)
}
const url = new URL(raw.replace(/^postgres(ql)?:/, 'http:'))
const user = decodeURIComponent(url.username)
const password = decodeURIComponent(url.password)
const database = decodeURIComponent(url.pathname.replace(/^\//, '').split('/')[0] ?? '')
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(user) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(database)) {
  console.error('The database user and database name must be simple identifiers.')
  process.exit(1)
}
const quoted = password.replaceAll("'", "''")
writeFileSync('/tmp/datavalley-db.sql', `DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${user}') THEN
    CREATE ROLE ${user} LOGIN PASSWORD '${quoted}';
  ELSE
    ALTER ROLE ${user} WITH LOGIN PASSWORD '${quoted}';
  END IF;
END
$$;
SELECT format('CREATE DATABASE %I OWNER %I', '${database}', '${user}')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${database}')
\\gexec
`)
NODE
if [[ "$(id -u)" -eq 0 ]]; then
  su -s /bin/bash postgres -c "psql -v ON_ERROR_STOP=1 -f /tmp/datavalley-db.sql"
else
  sudo -n -u postgres psql -v ON_ERROR_STOP=1 -f /tmp/datavalley-db.sql
fi
rm -f /tmp/datavalley-db.sql

npm_bin="$(command -v npm)"

install_units() {
  local src="$1"
  local dest="$2"
  local start="$3"
  sed \
    -e "s|^WorkingDirectory=.*|WorkingDirectory=${CURRENT_LINK}|" \
    -e "s|^User=.*|User=${APP_USER}|" \
    -e "s|^EnvironmentFile=.*|EnvironmentFile=${SHARED_DIR}/.env|" \
    -e "s|^ExecStart=.*|ExecStart=${npm_bin} ${start}|" \
    "$src" | run tee "$dest" >/dev/null
}

write_units() {
  install_units "$RELEASE_DIR/deploy/datavalley-api.service" /etc/systemd/system/datavalley-api.service "run start -w @datavalley/api"
  install_units "$RELEASE_DIR/deploy/datavalley-worker.service" /etc/systemd/system/datavalley-worker.service "run start -w @datavalley/worker"
}

write_caddy() {
  local admin_email="${INITIAL_ADMIN_EMAIL:-admin@${DOMAIN}}"
  cat <<CADDY | run tee /etc/caddy/Caddyfile >/dev/null
{
	email ${admin_email}
}

${DOMAIN} {
	handle /api/* {
		reverse_proxy 127.0.0.1:${API_PORT}
	}
	handle /docs* {
		reverse_proxy 127.0.0.1:${API_PORT}
	}
	handle {
		root * ${CURRENT_LINK}/apps/web/dist
		try_files {path} /index.html
		file_server
	}
}
CADDY
  run caddy validate --config /etc/caddy/Caddyfile
}

ensure_readable() {
  local dir="$1"
  run chmod a+x "$DEPLOY_PATH" "$DEPLOY_PATH/releases" "$dir" "$dir/apps" "$dir/apps/web"
  if [[ -d "$dir/apps/web/dist" ]]; then
    run chmod -R a+rX "$dir/apps/web/dist"
  fi
}

wait_healthy() {
  local tries="$1"
  local attempt
  for ((attempt = 1; attempt <= tries; attempt += 1)); do
    if curl -fsS "https://${DOMAIN}/api/v1/health" >/dev/null; then
      return 0
    fi
    sleep 5
  done
  return 1
}

restart_services() {
  write_units || return 1
  write_caddy || return 1
  run systemctl daemon-reload || return 1
  run systemctl enable datavalley-api || return 1
  run systemctl restart datavalley-api || return 1
  if [[ -n "${REDIS_URL:-}" ]]; then
    run systemctl enable datavalley-worker || return 1
    run systemctl restart datavalley-worker || return 1
  else
    run systemctl disable --now datavalley-worker || true
  fi
  run systemctl enable caddy || return 1
  run systemctl reload caddy || run systemctl restart caddy || return 1
}

rollback_or_exit() {
  if [[ -z "$previous_release" || ! -d "$previous_release" ]]; then
    echo "https://${DOMAIN}/api/v1/health did not succeed." >&2
    exit 1
  fi
  echo "https://${DOMAIN}/api/v1/health did not succeed. Restoring ${previous_release}." >&2
  ln -sfn "$previous_release" "$CURRENT_LINK"
  ensure_readable "$previous_release"
  if restart_services && wait_healthy 12; then
    echo "Restored the previous release. This deploy failed." >&2
  else
    echo "The previous release did not become healthy." >&2
  fi
  exit 1
}

# An install that still lives directly in DEPLOY_PATH becomes the previous release.
# The running API keeps its open files. Caddy is reloaded onto that release before the new build.
if [[ ! -L "$CURRENT_LINK" && -f "$DEPLOY_PATH/package.json" ]]; then
  adopted="$(date -u -d "${RELEASE_STAMP:0:4}-${RELEASE_STAMP:4:2}-${RELEASE_STAMP:6:2} ${RELEASE_STAMP:8:2}:${RELEASE_STAMP:10:2}:${RELEASE_STAMP:12:2} UTC -1 second" +%Y%m%d%H%M%S)"
  adopted_dir="${DEPLOY_PATH}/releases/${adopted}"
  mkdir -p "$adopted_dir" "$SHARED_DIR"
  if [[ -f "$DEPLOY_PATH/.env" && ! -f "$SHARED_DIR/.env" ]]; then
    mv "$DEPLOY_PATH/.env" "$SHARED_DIR/.env"
  elif [[ -f "$DEPLOY_PATH/.env" ]]; then
    rm -f "$DEPLOY_PATH/.env"
  fi
  if [[ -d "$DEPLOY_PATH/data" && ! -L "$DEPLOY_PATH/data" ]]; then
    mkdir -p "$SHARED_DIR/data"
    if [[ -d "$SHARED_DIR/data/media" && -z "$(ls -A "$SHARED_DIR/data/media" 2>/dev/null || true)" ]]; then
      rmdir "$SHARED_DIR/data/media"
    fi
    shopt -s nullglob
    for item in "$DEPLOY_PATH/data"/*; do
      name="$(basename "$item")"
      if [[ ! -e "$SHARED_DIR/data/$name" ]]; then
        mv "$item" "$SHARED_DIR/data/$name"
      fi
    done
    shopt -u nullglob
    if [[ -z "$(ls -A "$DEPLOY_PATH/data" 2>/dev/null || true)" ]]; then
      rmdir "$DEPLOY_PATH/data"
    fi
  fi
  shopt -s dotglob nullglob
  for entry in "$DEPLOY_PATH"/*; do
    name="$(basename "$entry")"
    if [[ "$name" == "releases" || "$name" == "shared" || "$name" == "current" || "$name" == "data" ]]; then
      continue
    fi
    mv "$entry" "$adopted_dir/"
  done
  shopt -u dotglob nullglob
  ln -sfn "$adopted_dir" "$CURRENT_LINK"
  if [[ ! -e "$DEPLOY_PATH/data" ]]; then
    ln -sfn "$SHARED_DIR/data" "$DEPLOY_PATH/data"
  fi
  ensure_readable "$adopted_dir"
  write_units
  write_caddy
  run systemctl daemon-reload
  run systemctl enable datavalley-api
  if [[ -n "${REDIS_URL:-}" ]]; then
    run systemctl enable datavalley-worker
  fi
  run systemctl enable caddy
  run systemctl reload caddy || run systemctl restart caddy
fi

if [[ -f "$SHARED_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SHARED_DIR/.env"
  set +a
fi

cd "$RELEASE_DIR"
npm ci
npm run build --workspace @datavalley/web
npm run migrate
npm run seed:admin

if [[ -L "$CURRENT_LINK" ]]; then
  previous_release="$(readlink -f "$CURRENT_LINK")"
fi
if [[ -n "$previous_release" && "$previous_release" == "$(readlink -f "$RELEASE_DIR")" ]]; then
  previous_release=""
fi

ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
run mkdir -p "$SHARED_DIR/data/media"
run chown -R "$APP_USER:$APP_USER" "$RELEASE_DIR" "$SHARED_DIR"
run chmod 600 "$SHARED_DIR/.env"
ensure_readable "$RELEASE_DIR"

if ! restart_services; then
  rollback_or_exit
fi

if run ufw status | grep -q 'Status: active'; then
  run ufw allow 22/tcp
  run ufw allow 80/tcp
  run ufw allow 443/tcp
fi

if ! run systemctl is-active --quiet datavalley-api || ! run systemctl is-active --quiet caddy; then
  rollback_or_exit
fi
if [[ -n "${REDIS_URL:-}" ]] && ! run systemctl is-active --quiet datavalley-worker; then
  rollback_or_exit
fi

if ! wait_healthy 12; then
  rollback_or_exit
fi

if [[ -n "$previous_release" ]]; then
  keep_old="$(readlink -f "$previous_release")"
else
  keep_old=""
fi
keep_new="$(readlink -f "$RELEASE_DIR")"
shopt -s nullglob
for dir in "$DEPLOY_PATH/releases"/*; do
  [[ -d "$dir" ]] || continue
  real="$(readlink -f "$dir")"
  if [[ "$real" == "$keep_new" || "$real" == "$keep_old" ]]; then
    continue
  fi
  rm -rf "$dir"
done
shopt -u nullglob

echo | openssl s_client -servername "$DOMAIN" -connect "${DOMAIN}:443" 2>/dev/null | openssl x509 -noout -subject -dates
echo "Deployed https://${DOMAIN}"
