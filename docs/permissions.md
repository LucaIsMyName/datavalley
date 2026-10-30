# Permissions

Access checks run on the server for every project, table, row, column, cell, export, formula reference, and plugin call.

Missing and unauthorized resources return the same `404` response, so a guessed id does not reveal that a record exists. System administration routes return `403` when the caller is not an admin.

## Resolution

Grants are `allow` or `deny` for one action on one resource. The check walks from the most specific resource upward:

`cell → row → column → table → project → system`

The first level that has any grant for that action decides the result. At that level, `deny` wins over `allow`. No grant anywhere means deny.

Row, column, and cell grants are exception overlays. Opening a table still requires permission to view that table, usually inherited from the project. A row `deny` hides that row from the page query. A column `deny` removes the column from reads and exports.

Admins bypass checks only for system resources such as user management, API keys, plugins, and the audit log. Project data still uses explicit grants. Creating a project writes a full owner grant set for the creator.

The `share` action is stored for later public sharing. This version does not create public links.
