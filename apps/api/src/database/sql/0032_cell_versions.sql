-- Row version at which each cell (or row field such as color and notes) was last written.
-- A stale write is merged when none of its keys changed after the version it was based on.
ALTER TABLE table_rows ADD COLUMN cell_versions jsonb NOT NULL DEFAULT '{}'::jsonb;
