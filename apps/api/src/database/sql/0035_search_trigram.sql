-- Global and in-table search match cell text with ILIKE '%term%', which only an index on trigrams can serve.
-- pg_trgm is a trusted extension since PostgreSQL 13, so the database owner can create it without superuser.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS table_cells_value_text_trgm ON table_cells USING gin (value_text gin_trgm_ops);
