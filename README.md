# Datavalley

Self-hosted CRM: projects, dynamic tables, formulas, media, permissions, and integrations. The API is the source of truth; the web app talks to it at `/api/v1`.

## Features

- **Projects and tables** — Create and organise "Projects" via Tables. A table can be any type of datalist you need. Row notes open from the gutter; the drawer lists editable row fields (same cell editors as the grid) and live markdown blocks below (headings, lists, and inline formatting).
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
