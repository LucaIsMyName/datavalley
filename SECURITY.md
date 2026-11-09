# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately through [GitHub security advisories](https://github.com/LucaIsMyName/datavalley/security/advisories/new) for this repository.

Include what an attacker can do, the steps or request that show it, and the version (root `package.json`) or commit you tested. You should get an answer within a week. Once a fix is released, the advisory is published with credit unless you prefer otherwise.

## Supported versions

Fixes go into the latest release on `main`. Older releases do not receive backports, so keep instances on the current version.

## Scope

In scope are the API, the web app, the worker, the deploy scripts, and the published Docker setup. Typical examples are permission bypasses between users or projects, SSRF through connectors or AI providers, cross-site scripting, and leaks of credentials or session data. Problems that need an already compromised server or admin account, and missing hardening without a concrete exploit, are better raised as regular issues.

## Operating an instance safely

- Use long random values for `SESSION_SECRET`, `CSRF_SECRET`, and `CREDENTIALS_KEY`, and never commit `.env` files.
- Run PostgreSQL rather than PGLite in production, and keep backups encrypted with `BACKUP_PASSPHRASE` (see [docs/deploy.md](docs/deploy.md)).
- Keep the instance behind HTTPS; the deploy scripts configure Caddy for this.
