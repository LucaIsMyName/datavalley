# Local setup

Datavalley runs as Node processes. Docker is not required.

## Prerequisites

- Node.js 22
- npm 10
- PostgreSQL 16 for production and shared development
- Redis 7 when you want the background worker (required for scheduled connector sync; without Redis, manual sync runs inline in the API process)

For a single-machine trial, `DATABASE_URL=pglite:./data/pglite` uses embedded Postgres. A relative path is resolved from the repository root, including when the API starts from `apps/api`. Use a real PostgreSQL server for any shared or production database.

## Install

```bash
nvm use
cp .env.development.example .env.development
npm install
npm run dev
```

`npm run dev` loads `.env.development`, creates the admin from that file when one does not exist, and starts the API and the web app. The example file signs in as `admin` / `dev-admin-password`. That password stays valid in development.

The API listens on `http://127.0.0.1:3000` and the web app on `http://localhost:5173`. API docs are at `http://127.0.0.1:3000/docs`.

A password reset with `SMTP_HOST` empty prints the reset link in the API log. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` to send the link by email.

Create the PostgreSQL role and database yourself, then point `DATABASE_URL` at it. To use ICU sorting for text, create the database with:

```sql
CREATE DATABASE datavalley TEMPLATE template0 LOCALE_PROVIDER icu ICU_LOCALE 'und-x-icu';
```

Text sorting stays on the database collation. The app does not re-sort pages in the browser.

## Tests

CSV import (new table or into an open table) accepts comma, semicolon, tab, pipe, or a single custom separator character.

```bash
npm test
```

API tests use embedded Postgres and do not need a local server. End-to-end tests use Playwright:

```bash
npx playwright install chromium
npm run test:e2e
```
