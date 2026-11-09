# Data model

Application metadata and dynamic CRM data live in one PostgreSQL database. Creating a CRM table does not create a physical database table.

- `tables` and `table_columns` describe the schema. `tables.format_rules` stores conditional colors for the table.
- `table_rows` stores identity, fractional `position`, an integer `version`, an optional row `color`, markdown `notes`, and a `row_number` taken from `tables.next_row_number`. Deleted numbers are not reused. The web UI opens notes from the row gutter, edits row cells inline with the same controls as the grid, and edits notes as rendered markdown blocks while persisting the same string field. List pages return an empty notes string. The record and the notes drawer load the stored notes.
- `projects.description` is optional text. `table_tags` and `table_statuses` are catalogs scoped to one table, unique by name ignoring case. Tag, user, and status cells store ids in `value_jsonb`. A `row_id` column is not writable: it shows the row id or the sequence number.
- `table_cells` stores one sparse typed value per non-empty cell: text, numeric, boolean, timestamptz, or jsonb. A cell can also store a `background` color, including when it has no value. `mail` is stored as text and must be an email address.
- Empty cells are absent.
- `column_options` stores select and radio choices.
- `table_views.definition` stores filters, sort, widths, hidden columns, grouping, and conditional formatting together.
- `user_favorites` and `user_recent_items` power the dashboard. `user_table_state` stores one user's sort, filter, and display for a table. Display holds the grid, chart, or timeline mode. The chart stores its type, dimensions, values, and whether each row stays its own category. The timeline stores the date column, title columns, and zoom. Kanban fields are reserved. Column order and row order stay on the table itself.
- `formulas`, `formula_dependencies`, and `formula_cache` store calculations.
- `relations` and `relation_records` store links. Cardinality includes `many_to_one`. A table marked `activity` contributes its linked rows to a record timeline, together with that record's notes.
- `projects.settings.automations` stores a built-in stage follow-up, which can be turned off, and flowcharts. A flow starts when a row is created, a column changes, or a row is deleted, then branches on the column type and creates or updates rows. A shared catalog decides which comparisons and field values each column type allows.
- `audit_logs` is append-only. A trigger rejects updates and deletes.

Indexes cover row order, cell lookup by row, and column value filters for text, number, and time. A trigram index on cell text serves search, so the database needs the `pg_trgm` extension. It ships with PostgreSQL and is trusted since version 13, so the database owner can enable it; migrations stop with an error if it is missing. Positions use the `C` collation because fractional-index keys only sort correctly byte by byte.

Dates are calendar dates (`YYYY-MM-DD`) in `value_text`. Date-times are `timestamptz` stored in UTC and shown in the user timezone. Currency amounts use `numeric(19,4)` plus an ISO code on the column. There is no exchange-rate conversion.

Row updates send the current `version`. The server keeps that number as a clock and applies only the cells in the request. Two people can edit different cells of the same row. A later write to the same cell replaces the earlier one.
