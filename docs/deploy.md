# Deployment

`npm run deploy` installs one instance on an Ubuntu or Debian VPS. Each instance has its own env file on your machine, such as `.env.lucaProd` or `.env.customer1`. The command lists those files and asks which one to use. `.env.development` is for local work and is not offered.

`DEPLOY_MODE` chooses how that instance runs:

- `host` (the default) installs PostgreSQL, Node.js, Caddy, and systemd on the VPS.
- `docker` installs Docker Engine and runs the instance with Docker Compose.

Hetzner is a typical target. The same steps work on any Ubuntu or Debian VPS with a public IPv4 address, a DNS name pointing at that address, and an SSH user that is root or can run `sudo` without a password.

## Configure

```bash
cp .env.production.example .env.customer1
```

Fill in the SSH host, user, port, and the absolute path to the private key. Set `DOMAIN` and `WEB_ORIGIN=https://DOMAIN`. Set long random values for `SESSION_SECRET`, `CSRF_SECRET`, and `CREDENTIALS_KEY`. Set `DATABASE_URL` to Postgres on the VPS (the example uses `127.0.0.1` on that server), the initial admin, and the SMTP settings used for password reset. Leave `DEPLOY_MODE=host` unless this instance should run in Docker. `TRUST_PROXY` is set to true on the server.

The real env files stay on your machine. Git keeps `.env.development.example` and `.env.production.example`.

Do not use embedded `pglite` in production.

## Install

```bash
npm run deploy
```

The script checks the SSH key, installs `openssh-client` and `rsync` on the server when `ssh`, `scp`, or `rsync` is missing, and copies the app into a new directory under `DEPLOY_PATH` (default `/opt/datavalley`). On the server it confirms Ubuntu or Debian, checks that `DOMAIN` resolves to the server's public IPv4, and then follows `DEPLOY_MODE`.

With `DEPLOY_MODE=host` it:

- Installs PostgreSQL 16, Node.js 22, and Caddy. PostgreSQL 16 comes from the PGDG apt repository when the distro does not already ship it, which is the usual case on Debian.
- Installs Redis when `REDIS_URL` is set
- Creates the database role from `DATABASE_URL` and the `APP_USER` (default `datavalley`) only when they are missing
- Builds the web app in the new release, runs migrations, and seeds the admin on the first deploy
- Points `current` at that release, then installs the systemd units and a Caddy site that proxies `/api` to the API and serves the web build (Swagger UI at `/docs` is development-only; production still exposes OpenAPI JSON for the in-app API reference)
- Uses Redis when `REDIS_URL` is set for the worker, for shared API-key rate limiting, and to fan out live project events across API processes
- Proxies `/api/v1/projects/*/events` with `flush_interval -1` so Caddy sends each live edit as soon as the API writes it
- Checks that the API and Caddy are active

Both modes request an HTTPS certificate for `DOMAIN` and then require `https://DOMAIN/api/v1/health` to succeed. There is no separate Certbot step. Caddy obtains and renews a public certificate over HTTP-01 when it loads the site. Host mode stores it under `/var/lib/caddy`. Docker mode stores it in the `datavalley_caddy` volume. A private name, or a DNS record that does not point at this server, fails the deploy.

Run the same command again to upgrade that instance. The previous release stays in place until the health check passes. If `ufw` is installed and already enabled, the script allows ports 22, 80, and 443. It does not install or enable a firewall. A minimal Debian image often has no `ufw`, and that is left as it is.

## Docker Compose

Set `DEPLOY_MODE=docker` in the instance env file. The same `npm run deploy` command installs Docker Engine and the Compose plugin when they are missing, using Docker's apt repository for the server's Ubuntu or Debian codename. It does not install Node.js, PostgreSQL, Redis, or Caddy on the host. Compose builds the API, worker, and Caddy images on the server and starts the project named `datavalley`.

A loopback `DATABASE_URL` (`127.0.0.1`, `localhost`, or `::1`) starts Postgres 16 in Compose and rewrites that URL to the `postgres` service. Any other host is left unchanged and must be reachable from the containers. The same rule applies to `REDIS_URL`. The worker container starts only when `REDIS_URL` is set. The API listens on `0.0.0.0` inside the Compose network and is not published on the host. Caddy publishes ports 80 and 443, and starts once the API container reports healthy through `/api/v1/health`, which returns 503 while the database is unreachable. The API and worker run as the unprivileged `node` user. The one-shot `migrate` container runs as root so it can hand the media volume to that user, including volumes created by older releases.

Uploads go to the `datavalley_media` volume. Postgres, Redis, media, and certificate volumes are kept across releases. The bundled database password is applied when that volume is created; a later change to `DATABASE_URL` does not alter the password already stored in the volume.

If host `caddy.service` is active, the Docker deploy stops and leaves that install in place. Switch only after stopping the host services on purpose. The script does not move an existing host database into Compose.

Compose v2.20 or newer is required. The script installs a current plugin when Docker Compose is missing.

## Releases

Each deploy uploads into `releases/YYYYMMDDHHMMSS` (UTC). Shared files stay outside the release:

```
/opt/datavalley/
  releases/20261101165133/
  releases/20261101163000/
  shared/.env
  shared/data/media
  current -> releases/20261101165133
```

On a host install, systemd and Caddy follow `current`, and uploads stay in `shared/`. On a Docker install, Compose is started from the release directory and uploads stay in the `datavalley_media` volume. The env file stays in `shared/` for both. After a healthy deploy the script keeps the new release and the one before it, and deletes older release directories. Docker mode also removes images for the deleted releases. It does not delete volumes.

The live site keeps serving the previous release while the new one is built. Host mode then points `current` at the new release and restarts systemd. Docker mode starts the new Compose project from that release and then points `current` at it. The script probes `https://DOMAIN/api/v1/health` up to 12 times, 5 seconds apart. If that probe fails and a previous release exists, it points `current` back, restarts, probes again, and exits with an error. The first deploy has no previous release to restore. A Docker rollback needs a previous release that already contains `deploy/compose.yml`.

An install that still has the app directly in `DEPLOY_PATH` is moved once into `releases/` and its `.env` and `data/` are moved into `shared/` before the new release is activated.

A rollback restores the previous code and web build. SQL migrations are forward only, so a rollback does not undo schema changes that already ran.

The local database is not deployed. rsync sends the source tree and skips `data/`, `.env`, and `.env.*`. Postgres stays on the VPS. Deploy does not drop tables or load local rows. `seed:admin` does nothing when an administrator already exists.

## Prerequisites

A domain A record to the VPS public IPv4, plus a root or sudo user and an SSH key, is the right start. These are also required:

- The sudo user must be passwordless (`sudo -n`). A sudo account that asks for a password cannot run this script.
- The private key path is absolute on the machine that runs `npm run deploy`. The matching public key is in that server user's `authorized_keys`. `BatchMode` is on, so a passphrase-protected key only works if an agent already holds it.
- The computer that runs `npm run deploy` needs `ssh`, `scp`, and `rsync`, plus a filled `.env.*` file: Postgres `DATABASE_URL`, `WEB_ORIGIN=https://DOMAIN`, secrets of at least 32 characters, an admin password of at least 12, and SMTP settings.
- The VPS must be Ubuntu or Debian, with systemd, a public IPv4, and an SSH server already accepting logins. The script installs `ssh`, `scp`, and `rsync` there when they are missing. Host mode then installs PostgreSQL 16, Node.js 22, and Caddy. Docker mode installs Docker Engine instead. It does not expect those packages to be installed already.
- Ports 22, 80, and 443 must be open in the provider firewall (Hetzner Cloud firewall or the equivalent). The script only opens `ufw` when `ufw` is already installed and enabled. It does not enable a firewall, and it cannot change a cloud firewall.
- DNS at deploy time must resolve the domain to that same public IPv4. Caddy obtains the certificate over HTTP-01, so port 80 has to reach the VPS. An IPv6-only record fails the check the script already makes.

## Backup

```bash
DATABASE_URL=... MEDIA_ROOT=./data/media bash scripts/backup.sh ./backups
DATABASE_URL=... MEDIA_ROOT=./data/media bash scripts/restore.sh ./backups/datavalley-STAMP.dump ./backups/media-STAMP.tar.gz
```

Backups are a PostgreSQL custom-format dump plus the media directory. On a host install, `MEDIA_ROOT` is the shared media directory on the VPS. The script reads the dump back with `pg_restore --list` and fails if it cannot, so a broken backup shows up when it is written.

| Variable | Effect |
|---|---|
| `BACKUP_PASSPHRASE` | Encrypts both files with AES-256 (`openssl enc -pbkdf2`) and keeps only the `.enc` copies. `restore.sh` needs the same passphrase. Store it outside the server, because losing it makes the backups unreadable. |
| `BACKUP_KEEP_DAYS` | Deletes `datavalley-*` and `media-*` files in the backup directory that are older than this many days. Other files are left alone. |

Run it from cron for scheduled backups, for example `0 3 * * * cd /opt/datavalley/current && BACKUP_KEEP_DAYS=14 BACKUP_PASSPHRASE=... DATABASE_URL=... MEDIA_ROOT=... bash scripts/backup.sh /var/backups/datavalley`. Copy the directory to storage off the VPS; a backup on the same disk does not survive losing the server.

For a Docker install with the bundled database, dump from the Compose project on the server:

```bash
docker compose -p datavalley -f /opt/datavalley/current/deploy/compose.yml --profile bundled-db exec -T postgres \
  pg_dump --format=custom --username datavalley datavalley > ./backups/datavalley.dump
docker compose -p datavalley -f /opt/datavalley/current/deploy/compose.yml exec -T api \
  tar -czf - -C /var/lib/datavalley/media . > ./backups/media.tar.gz
```

Use the database user and database name from `DATABASE_URL` in place of `datavalley`. When `DATABASE_URL` points at a database outside Compose, run `pg_dump` against that URL from a machine that can reach it, and still tar the media directory from the `api` container. The bundled Postgres port is not published on the host.
