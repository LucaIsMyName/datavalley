# Deployment

`npm run deploy` installs one instance on an Ubuntu VPS. Each instance has its own env file on your machine, such as `.env.lucaProd` or `.env.customer1`. The command lists those files and asks which one to use. `.env.development` is for local work and is not offered.

Hetzner is a typical target. The same steps work on any Ubuntu VPS with a public IPv4 address, a DNS name pointing at that address, and an SSH user that is root or can run `sudo` without a password.

## Configure

```bash
cp .env.production.example .env.customer1
```

Fill in the SSH host, user, port, and the absolute path to the private key. Set `DOMAIN` and `WEB_ORIGIN=https://DOMAIN`. Set long random values for `SESSION_SECRET`, `CSRF_SECRET`, and `CREDENTIALS_KEY`. Set `DATABASE_URL` to a local Postgres URL, the initial admin, and the SMTP settings used for password reset. `TRUST_PROXY` is set to true on the server.

The real env files stay on your machine. Git keeps `.env.development.example` and `.env.production.example`.

Do not use embedded `pglite` in production.

## Install

```bash
npm run deploy
```

The script checks the SSH key, copies the app to `DEPLOY_PATH` (default `/opt/datavalley`), and on the server:

- Confirms Ubuntu and that `DOMAIN` resolves to the server's public IPv4
- Installs PostgreSQL 16, Node.js 22, and Caddy
- Installs Redis when `REDIS_URL` is set
- Creates the database role from `DATABASE_URL` and the `APP_USER` (default `datavalley`)
- Builds the web app, runs migrations, and seeds the admin on the first deploy
- Installs the systemd units and a Caddy site that proxies `/api` to the API and serves the web build (Swagger UI at `/docs` is development-only; production still exposes OpenAPI JSON for the in-app API reference)
- Uses Redis when `REDIS_URL` is set for the worker and for shared API-key rate limiting across processes
- Requests an HTTPS certificate for `DOMAIN`
- Checks that the API and Caddy are active and that `https://DOMAIN/api/v1/health` succeeds

Run the same command again to upgrade that instance. If `ufw` is already enabled, the script allows ports 22, 80, and 443. It does not enable the firewall.

## Backup

```bash
DATABASE_URL=... MEDIA_ROOT=./data/media bash scripts/backup.sh ./backups
DATABASE_URL=... MEDIA_ROOT=./data/media bash scripts/restore.sh ./backups/datavalley-STAMP.dump ./backups/media-STAMP.tar.gz
```

Backups are a PostgreSQL custom-format dump plus the media directory.
