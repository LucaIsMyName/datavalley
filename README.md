# Datavalley

Self-hosted CRM for projects, dynamic tables, formulas, and integrations.

The API is the source of truth. The web app talks to it through `/api/v1`. Accounts are created by an administrator. Data is private until a grant allows access. The header has a search field beside notifications. It finds projects, tables, columns, rows, pages, favorites, and integrations. Opening a column, row, or cell jumps to that table and highlights the target briefly, without filtering the grid. On a phone that field is hidden and a magnifying glass opens the same search in a drawer. Press Command-K or Ctrl-K to focus it.

Signed-in documentation for projects, tables, and formulas is at `/doc`. A new project starts with a People table: Name, Mail, and one sample row. On a table page the name is an editable title and every other action lives in the grid: hover to insert a row or column, sort and filter from the column header, select rows or columns for bulk changes, and right-click for the action that belongs to that spot. Edits save themselves. A failed cell, column, or row edit shows a toast at the bottom right. The last 10 changes in a table can be undone. A column type change asks first when some cells would be cleared. Clicking a formula cell edits that column's expression, and every row shows the calculated value. Relation columns link a row to a record in another table. Columns can be tags, people, status, dates, or a read-only id. A project can carry a description, and each row can carry markdown notes. A forgotten password can be reset from an emailed link.

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
