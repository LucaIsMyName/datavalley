# Data model

Application metadata and dynamic CRM data live in one PostgreSQL database. Creating a CRM table does not create a physical database table.

- `tables` and `table_columns` describe the schema.
- `table_rows` stores identity, fractional `position`, and an integer `version`.
- `table_cells` stores one sparse typed value per non-empty cell: text, numeric, boolean, timestamptz, or jsonb.
- Empty cells are absent.
- `column_options` stores select and radio choices.
- `table_views.definition` stores filters, sort, widths, hidden columns, grouping, and conditional formatting together.
- `user_favorites` and `user_recent_items` power the dashboard.
- `formulas`, `formula_dependencies`, and `formula_cache` store calculations.
- `relations` and `relation_records` store links. Cardinality includes `many_to_one`.
- `audit_logs` is append-only. A trigger rejects updates and deletes.

Indexes cover row order, cell lookup by row, and column value filters for text, number, and time. If `pg_trgm` is available, a trigram index speeds in-table search. Search still uses `ILIKE` without that extension.

Dates are calendar dates (`YYYY-MM-DD`) in `value_text`. Date-times are `timestamptz` stored in UTC and shown in the user timezone. Currency amounts use `numeric(19,4)` plus an ISO code on the column. There is no exchange-rate conversion.

Row updates send the current `version`. A mismatch returns `409`.
