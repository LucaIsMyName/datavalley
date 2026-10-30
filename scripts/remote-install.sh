#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_PATH:?DEPLOY_PATH is required}"
: "${APP_USER:?APP_USER is required}"
: "${DOMAIN:?DOMAIN is required}"
: "${API_PORT:?API_PORT is required}"

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

set -a
# shellcheck disable=SC1091
source "$DEPLOY_PATH/.env"
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

cd "$DEPLOY_PATH"
npm ci
npm run build --workspace @datavalley/web
npm run migrate
npm run seed:admin

run mkdir -p "$DEPLOY_PATH/data/media"
run chown -R "$APP_USER:$APP_USER" "$DEPLOY_PATH"
run chmod 600 "$DEPLOY_PATH/.env"
run chmod a+x "$DEPLOY_PATH" "$DEPLOY_PATH/apps" "$DEPLOY_PATH/apps/web"
run chmod -R a+rX "$DEPLOY_PATH/apps/web/dist"

npm_bin="$(command -v npm)"
install_unit() {
  local src="$1"
  local dest="$2"
  local start="$3"
  sed \
    -e "s|^WorkingDirectory=.*|WorkingDirectory=${DEPLOY_PATH}|" \
    -e "s|^User=.*|User=${APP_USER}|" \
    -e "s|^EnvironmentFile=.*|EnvironmentFile=${DEPLOY_PATH}/.env|" \
    -e "s|^ExecStart=.*|ExecStart=${npm_bin} ${start}|" \
    "$src" | run tee "$dest" >/dev/null
}

install_unit deploy/datavalley-api.service /etc/systemd/system/datavalley-api.service "run start -w @datavalley/api"
install_unit deploy/datavalley-worker.service /etc/systemd/system/datavalley-worker.service "run start -w @datavalley/worker"
run systemctl daemon-reload
run systemctl enable datavalley-api
run systemctl restart datavalley-api
if [[ -n "${REDIS_URL:-}" ]]; then
  run systemctl enable datavalley-worker
  run systemctl restart datavalley-worker
else
  run systemctl disable --now datavalley-worker || true
fi

admin_email="${INITIAL_ADMIN_EMAIL:-admin@${DOMAIN}}"
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
		root * ${DEPLOY_PATH}/apps/web/dist
		try_files {path} /index.html
		file_server
	}
}
CADDY
run caddy validate --config /etc/caddy/Caddyfile
run systemctl enable caddy
run systemctl reload caddy || run systemctl restart caddy

if run ufw status | grep -q 'Status: active'; then
  run ufw allow 22/tcp
  run ufw allow 80/tcp
  run ufw allow 443/tcp
fi

run systemctl is-active --quiet datavalley-api
run systemctl is-active --quiet caddy
if [[ -n "${REDIS_URL:-}" ]]; then
  run systemctl is-active --quiet datavalley-worker
fi

healthy=0
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if curl -fsS "https://${DOMAIN}/api/v1/health" >/dev/null; then
    healthy=1
    break
  fi
  sleep 5
done
if [[ "$healthy" != 1 ]]; then
  echo "https://${DOMAIN}/api/v1/health did not succeed." >&2
  exit 1
fi
echo | openssl s_client -servername "$DOMAIN" -connect "${DOMAIN}:443" 2>/dev/null | openssl x509 -noout -subject -dates
echo "Deployed https://${DOMAIN}"
