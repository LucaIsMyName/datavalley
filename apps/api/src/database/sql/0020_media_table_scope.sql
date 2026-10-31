ALTER TABLE media_files
  ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES tables (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS media_files_table_id_idx ON media_files (table_id);
