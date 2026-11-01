# Data model

Application metadata and dynamic CRM data live in one PostgreSQL database. Creating a CRM table does not create a physical database table.

- `tables` and `table_columns` describe the schema. `tables.format_rules` stores conditional colors for the table.
- `table_rows` stores identity, fractional `position`, an integer `version`, an optional row `color`, markdown `notes`, and a `row_number` taken from `tables.next_row_number`. Deleted numbers are not reused.
- `projects.description` is optional text. `table_tags` and `table_statuses` are catalogs scoped to one table, unique by name ignoring case. Tag, user, and status cells store ids in `value_jsonb`. A `row_id` column is not writable: it shows the row id or the sequence number.
- `table_cells` stores one sparse typed value per non-empty cell: text, numeric, boolean, timestamptz, or jsonb. A cell can also store a `background` color, including when it has no value. `mail` is stored as text and must be an email address.
- Empty cells are absent.
- `column_options` stores select and radio choices.
- `table_views.definition` stores filters, sort, widths, hidden columns, grouping, and conditional formatting together.
- `user_favorites` and `user_recent_items` power the dashboard. `user_table_state` stores one user's sort, filter, and display for a table. Display holds the grid or chart mode and the chart's type, dimensions, and values. Timeline and kanban fields are reserved. Column order and row order stay on the table itself.
- `formulas`, `formula_dependencies`, and `formula_cache` store calculations.
- `relations` and `relation_records` store links. Cardinality includes `many_to_one`.
- `audit_logs` is append-only. A trigger rejects updates and deletes.

Indexes cover row order, cell lookup by row, and column value filters for text, number, and time. If `pg_trgm` is available, a trigram index speeds in-table search. Search still uses `ILIKE` without that extension.

Dates are calendar dates (`YYYY-MM-DD`) in `value_text`. Date-times are `timestamptz` stored in UTC and shown in the user timezone. Currency amounts use `numeric(19,4)` plus an ISO code on the column. There is no exchange-rate conversion.

Row updates send the current `version`. A mismatch returns `409`.
