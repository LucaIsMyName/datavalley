# Deployment

This app deploys to any VPS that can run Node.js 22, PostgreSQL 16, and optionally Redis 7. Hetzner is a typical target. The same steps work on other providers.

## Prerequisites

- Node.js 22 and npm
- PostgreSQL 16 with a database and a role limited to that database
- A reverse proxy that terminates TLS and forwards `/` to the web build and `/api` plus `/docs` to the API
- Redis if imports over the sync limit, formula recalculation jobs, or Google Sheets sync should run in the worker
- Writable `MEDIA_ROOT` for uploads

Do not run embedded `pglite` in production.

## Configure

```bash
cp .env.example .env
```

Set long random values for `SESSION_SECRET`, `CSRF_SECRET`, and `CREDENTIALS_KEY`. Set `TRUST_PROXY=true` behind a proxy. Set `WEB_ORIGIN` to the public site origin.

## Install

```bash
bash scripts/deploy.sh
npm run seed:admin
```

`INSTALL_SYSTEMD=1 bash scripts/deploy.sh` copies the units in `deploy/` and starts them. Edit the `WorkingDirectory` and `User` in those units before installing them on the server.

Upgrade by pulling the new release, running `npm ci`, `npm run migrate`, rebuilding the web app, and restarting the API and worker. Run migrations before the restart.

## Backup

```bash
DATABASE_URL=... MEDIA_ROOT=./data/media bash scripts/backup.sh ./backups
DATABASE_URL=... MEDIA_ROOT=./data/media bash scripts/restore.sh ./backups/datavalley-STAMP.dump ./backups/media-STAMP.tar.gz
```

Backups are a PostgreSQL custom-format dump plus the media directory.
