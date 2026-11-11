# Datavalley

Self-hosted CRM: projects, dynamic tables, formulas, media, permissions, and integrations. The API is the source of truth; the web app talks to it at `/api/v1`.

## Features

- **Dashboard** — After sign-in, home is a project hub: rich project cards (table count, description, last edited), admin create/import, plus compact Recent and Favorites with links to full lists.
- **Projects and tables** — Create and organise "Projects" via Tables. A table can be any type of datalist you need. A new project can start from a sales pipeline (Companies, People, Deals, Tasks, and Meetings on a shared timeline), or from Products, Quotes, and Lines. Open a row as a record to edit its fields in a two-column table, plus notes, linked rows, and a timeline of its notes and linked activity rows. The header keeps the project and table name, or switch the table to a kanban board grouped by a select or status column. Every record can be saved as a PDF. A table can be marked as a quote by choosing the customer, status, and line columns, and that record downloads as a quote PDF. From the table toolbar, someone with share access can publish a public form: one link adds a row in the columns marked on the form. The public page follows the interface language and shows a loading state. A record can export that person and the linked rows as JSON, then remove them; a row owned by a connector is unlinked and kept. A relation cell shows the related table’s icon and the linked row’s main column, and follows that column when it changes, otherwise its name, its first value, or its id. The relation column header names that table and can change the table or the link type. The arrow on a grid row opens that record, and the row menu opens its notes. The dashboard lists tasks assigned to you that are due today or overdue, with the title, date, status, and project in separate columns. Assigning someone on a user column, and a failed connector sync, show up in the notification bell, which shows how many are unread, and go out by email when SMTP is configured. Deals include a Pipeline chart of count and amount by stage, which can be limited to one owner. Cell edits are listed on the record, and keystrokes a few seconds apart on the same cell show as one change from the first value to the last. A matching email or domain is pointed out while editing and after a CSV import. From a record you can send mail with the organization SMTP settings. Admins keep mail templates under Settings, where they can edit or delete them. Placeholders such as {{Name}} are filled from the row, and the sent message stays on that record and on the related person or deal. Organization admins can export a whole project as JSON (all tables, cells, relations, views, and formulas) and import it into another instance as a new project.
- **Formulas** — Per-cell expressions with cross-table references, aggregates, and conditional formatting. A chain of formulas shares one step and depth limit, and `IF` reads only the branch it uses. `SUM`, `MIN`, `MAX`, and `COUNT` of a number or currency column are calculated in the database. Saving a cell returns that row's formula values, so the grid can update without reloading the table. Function reference: [docs/formulas.md](docs/formulas.md).
- **Access control** — Grant-based permissions. A project member is full edit, sales (edit rows, not columns), or read-only. An admin can invite a colleague by email; they set their own password from the link. Organization admins can edit and delete users (including other admins), revoke or delete API keys, and view the audit log. Automations are flows on the project's tables. A step can be clicked or dragged onto the canvas. A failed automation stays on the record's field history and in the notification bell. A public form only runs automations that stay on that table, and a rejected submission does not use up the daily limit. Assigning someone still sends a notification.
- **Media** — Organization file library with table attachments and MIME-validated uploads. The library pages through every file the person can open, with the name and type filters applied in the query.
- **Integrations** — Built-in CSV import and export, plus user-defined HTTP data connectors (JSON/CSV/XML/HTML). Google Sheets import is not available. A table created from a connector stays read-only, shows a Connector badge on its tab, and updates on sync until you disconnect it; connecting again can overwrite mapped cells. Background worker runs sync jobs and schedules when Redis is configured. See [docs/connectors.md](docs/connectors.md).
- **Collapsible sidebar** — Desktop nav collapses to icons; hover previews labels; the pinned open/closed state is stored in `localStorage`.
- **Table editing** — Click a cell to select it. Enter, F2, or typing starts an edit. Tab moves across the row. Arrow keys move the selection, keep that row on screen, and load the next page. The starred main column stays first and remains on screen while the grid scrolls sideways. Row and column deletes ask for confirmation. Saves use row versions so concurrent edits return a conflict instead of silently overwriting. A saved cell stays in the loaded grid instead of reloading every page. Saved views keep the grid, chart, or timeline you were using. A filter that names a column the table does not have is rejected.
- **Live edits** — People with a project open see each other's saved changes without reloading. A colored ring and name show the cell or field someone else is in, including text as they type. Sort, filter, and hidden columns stay personal.
- **AI assistant** — An admin turns a provider on at Settings → AI. Signed-in users can then ask from any page about data they can already view. Provider base URLs are validated against SSRF rules (Ollama must use localhost). Chat is rate-limited per user (`AI_CHAT_RATE_LIMIT_MAX`, default 30 per 15 minutes). The assistant can open the project or table it is describing. The Ask window can be moved and resized, and earlier chats stay in this browser until you delete them. Suggestions for cells, formulas, and connectors stay drafts until the user confirms them with the existing save actions.

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
| [docs/api.md](docs/api.md) | API reference (same as `/doc/api`) |
| [docs/local-setup.md](docs/local-setup.md) | Local development and environment |
| [docs/deploy.md](docs/deploy.md) | Production deploy to an Ubuntu or Debian VPS (`npm run deploy`) |
| [docs/formulas.md](docs/formulas.md) | Formula language, function reference, and recipes |
| [docs/data-model.md](docs/data-model.md) | Database and table storage model |
| [docs/permissions.md](docs/permissions.md) | Grants and access checks |
| [docs/plugins.md](docs/plugins.md) | Plugins, credentials, and webhooks |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development workflow, checks, and pull requests |
| [SECURITY.md](SECURITY.md) | Reporting vulnerabilities and running an instance safely |

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

- Use PostgreSQL 13 or newer, not embedded PGLite. Migrations enable the `pg_trgm` extension for search, so the database user must own the database (the default for `npm run deploy` and the bundled Compose database).
- Back up with `scripts/backup.sh`; set `BACKUP_PASSPHRASE` to encrypt and `BACKUP_KEEP_DAYS` to prune old backups (see [docs/deploy.md](docs/deploy.md#backup)).
- Public forms accept at most 200 submissions a day by default; change it per form with `dailyLimit`.
- Set strong `SESSION_SECRET`, `CSRF_SECRET`, and `CREDENTIALS_KEY` (see `.env.production.example`).
- Set `REDIS_URL` when running multiple API processes or the worker, so API-key rate limits, live edit events, and job queues stay consistent. Without Redis, live edits still work on the single API process.
- Configure SMTP for password reset emails.
- `npm run deploy` keeps the previous release and switches back to it if `https://DOMAIN/api/v1/health` does not succeed. It does not copy the local database to the server. The VPS can be Ubuntu or Debian. Set `DEPLOY_MODE=docker` to run that instance with Docker Compose instead of systemd. Caddy obtains the HTTPS certificate either way.

Details: [docs/deploy.md](docs/deploy.md).
