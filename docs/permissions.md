# Permissions

Access checks run on the server for every project, table, row, column, cell, export, formula reference, and plugin call.

Missing and unauthorized resources return the same `404` response, so a guessed id does not reveal that a record exists. System administration routes return `403` when the caller is not an admin.

## Resolution

Grants are `allow` or `deny` for one action on one resource. The check walks from the most specific resource upward:

`cell → row → column → table → project → system`

The first level that has any grant for that action decides the result. At that level, `deny` wins over `allow`. No grant anywhere means deny.

Row, column, and cell grants are exception overlays. Opening a table still requires permission to view that table, usually inherited from the project. A row `deny` hides that row from the page query, and formulas evaluated for that person (aggregates, `LOOKUP`, `SUMIF`, `RELATION`) leave it out. A column `deny` removes the column from reads and exports.

Admins bypass checks only for system resources such as user management, API keys, plugins, and the audit log. Admins can edit and delete other users (including other admins), and can revoke or delete API keys. Project data still uses explicit grants. Creating a project writes a full owner grant set for the creator. The member dialog applies one preset: full edit (including columns and access), sales (edit rows, not the schema), or read-only. Inviting an email creates the account when needed and sends a link to set a password. Changing tables, columns, and who else has access stays with the full-edit preset.

The `share` action publishes a public form for one table. The form lists only the columns chosen on it. Anyone with the link can add a row in those columns. The row is created with the grants of the person who published the form, and the form stops accepting rows when that person loses edit access. Each form accepts at most `dailyLimit` submissions in a rolling 24 hours (default 200, set with `PUT /tables/{tableId}/form`), on top of the per-address rate limit, and rejects submissions that fill its hidden honeypot field. Members without `share` cannot create or read that link.
