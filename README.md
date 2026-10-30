# Datavalley

Self-hosted CRM for projects, dynamic tables, formulas, and integrations.

The API is the source of truth. The web app talks to it through `/api/v1`. Accounts are created by an administrator. Data is private until a grant allows access.

A table grid can save views, filter rows, color matching cells, import and export CSV, fill a column down the selection, and paste tab-separated values. Formula columns show their calculated value. Relation columns link a row to a record in another table. A forgotten password can be reset from an emailed link.

## Develop

Install Node.js 22, then:

```bash
cp .env.development.example .env.development
npm install
npm run dev
```

Open `http://localhost:5173` and sign in as `admin` / `dev-admin-password`. Local setup is in [docs/local-setup.md](docs/local-setup.md). To install another copy on an Ubuntu VPS, copy `.env.production.example` to a private name such as `.env.customer1` and run `npm run deploy`. See [docs/deploy.md](docs/deploy.md).

```bash
npm test
```
