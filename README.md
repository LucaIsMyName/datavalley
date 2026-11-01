# Datavalley

Self-hosted CRM: projects, dynamic tables, formulas, media, permissions, and integrations. The API is the source of truth; the web app talks to it at `/api/v1`.

## Features

- **Projects and tables** — Spreadsheet-style grid with many column types, views, import/export, and optional read-only mirror tables. The display control beside saved views switches that grid to a read-only chart (line, bar, or doughnut) that sums number and numeric formula columns by status, tag, text, mail, or URL. Dimension per row plots each row on its own when those values match. Bar and doughnut categories cycle a color palette. A line uses the app color, and a second value uses a lighter or darker shade. The choice is stored per user and per table, so a mirror does not change the source. **Date** columns (optional **time** and **from–to range** via the column menu) show localized values (English/German UI) and use an in-app calendar picker; range mode stores `{ from, to }` per cell (the end must not be before the start; a one-day range uses the same day for both). Switching single/range or date/time rewrites existing cells. Legacy `datetime` columns still work. **Select** columns keep options per column (create, rename, or delete from the in-cell dropdown or **Manage options** in the header menu); one click opens the option list; multi-select stays open while you toggle choices. **Allow multiple** toggles single vs multi-value (with confirmation when extra values would be dropped) and rewrites cells. Run DB migration `0024_select_column_unify.sql` on upgrade to convert legacy `multi_select` / `radio` columns to `select` with `config.multiple`.
- **Formulas** — Per-cell expressions with cross-table references, aggregates, and conditional formatting. Function reference: [docs/formulas.md](docs/formulas.md).
- **Access control** — Grant-based permissions; admins manage users, API keys, and audit logs.
- **Media** — Organization file library with table attachments and MIME-validated uploads.
- **Integrations** — Built-in plugins (CSV, optional Google Sheets) plus user-defined HTTP data connectors (JSON/CSV/XML/HTML). Background worker runs sync jobs and schedules when Redis is configured. See [docs/connectors.md](docs/connectors.md).

## Repository layout

| Path | Role |
|------|------|
| `apps/api` | Fastify API, migrations, OpenAPI |
| `apps/web` | React + Vite UI |
| `apps/worker` | BullMQ worker and plugin host |
| `packages/shared` | Shared types and helpers |
| `packages/formula-engine` | Formula parser and evaluator |
| `packages/api-client` | Typed browser client (cookies + CSRF) |
| `packages/plugin-sdk` | Plugin registration API |
| `docs/` | Setup, deployment, and design notes |
| `scripts/` | Dev orchestration, deploy, backup |

## Quick start

Requires **Node.js 22**.

```bash
cp .env.development.example .env.development
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and sign in with the credentials from `.env.development.example` (default `admin` / `dev-admin-password`).

API health and Swagger UI (development only): [http://127.0.0.1:3000/docs](http://127.0.0.1:3000/docs).

For PostgreSQL options, SMTP, migrations, and worker setup, see [docs/local-setup.md](docs/local-setup.md).

## Documentation

### In the app (after sign-in)

| Route | Content |
|-------|---------|
| `/doc/use` | User guide |
| `/doc/develop` | Developer guide |
| `/doc/api` | API reference (from OpenAPI) |

### In this repository

| Document | Topic |
|----------|--------|
| [docs/local-setup.md](docs/local-setup.md) | Local development and environment |
| [docs/deploy.md](docs/deploy.md) | Production deploy to a VPS (`npm run deploy`) |
| [docs/formulas.md](docs/formulas.md) | Formula language, function reference, and recipes |
| [docs/data-model.md](docs/data-model.md) | Database and table storage model |
| [docs/permissions.md](docs/permissions.md) | Grants and access checks |
| [docs/plugins.md](docs/plugins.md) | Plugins, credentials, and webhooks |

## Common commands

```bash
npm run dev          # API + web (loads .env.development)
npm test             # Vitest unit and integration tests
npm run test:e2e     # Playwright smoke tests
npm run build        # Build all workspaces
npm run migrate      # Apply SQL migrations
npm run deploy       # Remote install (see docs/deploy.md)
```

## Production notes

- Use PostgreSQL, not embedded PGLite.
- Set strong `SESSION_SECRET`, `CSRF_SECRET`, and `CREDENTIALS_KEY` (see `.env.production.example`).
- Set `REDIS_URL` when running multiple API processes or the worker, so API-key rate limits and job queues stay consistent.
- Configure SMTP for password reset emails.

Details: [docs/deploy.md](docs/deploy.md).
