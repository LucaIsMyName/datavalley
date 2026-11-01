# Deployment

`npm run deploy` installs one instance on an Ubuntu VPS. Each instance has its own env file on your machine, such as `.env.lucaProd` or `.env.customer1`. The command lists those files and asks which one to use. `.env.development` is for local work and is not offered.

Hetzner is a typical target. The same steps work on any Ubuntu VPS with a public IPv4 address, a DNS name pointing at that address, and an SSH user that is root or can run `sudo` without a password.

## Configure

```bash
cp .env.production.example .env.customer1
```

Fill in the SSH host, user, port, and the absolute path to the private key. Set `DOMAIN` and `WEB_ORIGIN=https://DOMAIN`. Set long random values for `SESSION_SECRET`, `CSRF_SECRET`, and `CREDENTIALS_KEY`. Set `DATABASE_URL` to Postgres on the VPS (the example uses `127.0.0.1` on that server), the initial admin, and the SMTP settings used for password reset. `TRUST_PROXY` is set to true on the server.

The real env files stay on your machine. Git keeps `.env.development.example` and `.env.production.example`.

Do not use embedded `pglite` in production.

## Install

```bash
npm run deploy
```

The script checks the SSH key, installs `openssh-client` and `rsync` on the server when `ssh`, `scp`, or `rsync` is missing, copies the app into a new directory under `DEPLOY_PATH` (default `/opt/datavalley`), and on the server:

- Confirms Ubuntu and that `DOMAIN` resolves to the server's public IPv4
- Installs PostgreSQL 16, Node.js 22, and Caddy
- Installs Redis when `REDIS_URL` is set
- Creates the database role from `DATABASE_URL` and the `APP_USER` (default `datavalley`) only when they are missing
- Builds the web app in the new release, runs migrations, and seeds the admin on the first deploy
- Points `current` at that release, then installs the systemd units and a Caddy site that proxies `/api` to the API and serves the web build (Swagger UI at `/docs` is development-only; production still exposes OpenAPI JSON for the in-app API reference)
- Uses Redis when `REDIS_URL` is set for the worker and for shared API-key rate limiting across processes
- Requests an HTTPS certificate for `DOMAIN`
- Checks that the API and Caddy are active and that `https://DOMAIN/api/v1/health` succeeds

Run the same command again to upgrade that instance. The previous release stays in place until the health check passes. If `ufw` is already enabled, the script allows ports 22, 80, and 443. It does not enable the firewall.

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

systemd and Caddy follow `current`. The env file and uploads stay in `shared/`. After a healthy deploy the script keeps the new release and the one before it, and deletes older release directories.

The live site keeps serving the previous release while the new one is built. The script then points `current` at the new release and restarts. It probes `https://DOMAIN/api/v1/health` up to 12 times, 5 seconds apart. If that probe fails and a previous release exists, it points `current` back, restarts, probes again, and exits with an error. The first deploy has no previous release to restore.

An install that still has the app directly in `DEPLOY_PATH` is moved once into `releases/` and its `.env` and `data/` are moved into `shared/` before the new release is activated.

A rollback restores the previous code and web build. SQL migrations are forward only, so a rollback does not undo schema changes that already ran.

The local database is not deployed. rsync sends the source tree and skips `data/`, `.env`, and `.env.*`. Postgres stays on the VPS. Deploy does not drop tables or load local rows. `seed:admin` does nothing when an administrator already exists.

## Prerequisites

A domain A record to the VPS public IPv4, plus a root or sudo user and an SSH key, is the right start. These are also required:

- The sudo user must be passwordless (`sudo -n`). A sudo account that asks for a password cannot run this script.
- The private key path is absolute on the machine that runs `npm run deploy`. The matching public key is in that server user's `authorized_keys`. `BatchMode` is on, so a passphrase-protected key only works if an agent already holds it.
- The computer that runs `npm run deploy` needs `ssh`, `scp`, and `rsync`, plus a filled `.env.*` file: Postgres `DATABASE_URL`, `WEB_ORIGIN=https://DOMAIN`, secrets of at least 32 characters, an admin password of at least 12, and SMTP settings.
- The VPS must be Ubuntu with a public IPv4 and an SSH server already accepting logins. The script installs `ssh`, `scp`, and `rsync` there when they are missing, then PostgreSQL 16, Node.js 22, and Caddy. It does not expect those packages to be installed already.
- Ports 22, 80, and 443 must be open in the provider firewall (Hetzner Cloud firewall or the equivalent). The script only opens `ufw` when `ufw` is already enabled. It does not enable a firewall, and it cannot change a cloud firewall.
- DNS at deploy time must resolve the domain to that same public IPv4. Caddy obtains the certificate over HTTP-01, so port 80 has to reach the VPS. An IPv6-only record fails the check the script already makes.

## Backup

```bash
DATABASE_URL=... MEDIA_ROOT=./data/media bash scripts/backup.sh ./backups
DATABASE_URL=... MEDIA_ROOT=./data/media bash scripts/restore.sh ./backups/datavalley-STAMP.dump ./backups/media-STAMP.tar.gz
```

Backups are a PostgreSQL custom-format dump plus the media directory.
