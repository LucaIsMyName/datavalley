# Local setup

Datavalley runs as Node processes. Docker is not required.

## Prerequisites

- Node.js 22
- npm 10
- PostgreSQL 16 for production and shared development
- Redis 7 when you want the background worker

For a single-machine trial, `DATABASE_URL=pglite:./data/pglite` uses embedded Postgres. A relative path is resolved from the repository root, including when the API starts from `apps/api`. Use a real PostgreSQL server for any shared or production database.

## Install

```bash
nvm use
cp .env.example .env
npm install
npm run migrate
npm run seed:admin
npm run dev
```

The API listens on `http://127.0.0.1:3000` and the web app on `http://localhost:5173`. API docs are at `http://127.0.0.1:3000/docs`.

Create the PostgreSQL role and database yourself, then point `DATABASE_URL` at it. To use ICU sorting for text, create the database with:

```sql
CREATE DATABASE datavalley TEMPLATE template0 LOCALE_PROVIDER icu ICU_LOCALE 'und-x-icu';
```

Text sorting stays on the database collation. The app does not re-sort pages in the browser.

## Tests

```bash
npm test
```

API tests use embedded Postgres and do not need a local server. End-to-end tests use Playwright:

```bash
npx playwright install chromium
npm run test:e2e
```
