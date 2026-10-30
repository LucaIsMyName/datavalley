# Datavalley

Self-hosted CRM for projects, dynamic tables, formulas, and integrations.

The API is the source of truth. The web app talks to it through `/api/v1`. Accounts are created by an administrator. Data is private until a grant allows access.

## Develop

Install Node.js 22, copy `.env.example` to `.env`, then:

```bash
npm install
npm run migrate
npm run seed:admin
npm run dev
```

Open `http://localhost:5173`. For production PostgreSQL, Redis, backups, and systemd, read [docs/local-setup.md](docs/local-setup.md) and [docs/deploy.md](docs/deploy.md).

```bash
npm test
```
