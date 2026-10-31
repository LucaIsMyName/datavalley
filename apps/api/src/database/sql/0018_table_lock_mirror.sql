ALTER TABLE tables
  ADD COLUMN locked_at timestamptz,
  ADD COLUMN mirror_of_table_id uuid REFERENCES tables (id) ON DELETE RESTRICT;

CREATE INDEX tables_mirror_of_table_id_idx ON tables (mirror_of_table_id);
