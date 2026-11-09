# Contributing to Datavalley

Thanks for helping. Bug reports, fixes, and focused features are all welcome.

## Before you start

- For anything larger than a small fix, open an issue first so the approach can be agreed before you write code.
- Read [agents.md](agents.md). It is the house style for people and coding agents alike: reuse existing code, keep changes focused, no `any`, comments explain why, and every change ships with tests.
- Report security problems privately as described in [SECURITY.md](SECURITY.md), not in a public issue.

## Development setup

Requires Node.js 22 (see `.nvmrc`).

```bash
cp .env.development.example .env.development
npm install
npm run dev
```

The default database is embedded PGLite, so no PostgreSQL install is needed. See [docs/local-setup.md](docs/local-setup.md) for PostgreSQL, Redis, SMTP, and the worker.

## Making a change

1. Branch from `main`.
2. Put code in the layer that owns it: `apps/api` for HTTP, permissions, and database work, `apps/web` for UI, `packages/shared` for types and pure helpers used by both.
3. Add or update Vitest tests next to the code (`*.test.ts`). API behaviour is tested through `apps/api/src/test/harness.ts`.
4. Database changes are new files in `apps/api/src/database/sql/`, numbered after the last one. Never edit a migration that has already been released.
5. Route or schema changes need `npm run openapi:generate`, and the updated `packages/contracts/openapi.json` is committed with the change. CI fails when the two drift apart.
6. Update the README or `docs/` when behaviour, configuration, or deployment changes.
7. Bump the patch number of the root `package.json` version once per change.

## Checks

CI runs these on every pull request; run them before you push:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e   # needs ports 3000 and 5173 free
```

## Pull requests

Keep a pull request to one change. Describe why it is needed, what changed, and how you verified it. Screenshots help for UI changes.
