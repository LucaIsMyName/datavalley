CREATE TABLE relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_table_id uuid NOT NULL REFERENCES tables (id) ON DELETE CASCADE,
  to_table_id uuid NOT NULL REFERENCES tables (id) ON DELETE CASCADE,
  from_column_id uuid REFERENCES table_columns (id) ON DELETE SET NULL,
  to_column_id uuid,
  cardinality text NOT NULL CHECK (cardinality IN ('one_to_one', 'one_to_many', 'many_to_one', 'many_to_many')),
  on_delete text NOT NULL DEFAULT 'restrict' CHECK (on_delete IN ('restrict', 'set_null')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE relation_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relation_id uuid NOT NULL REFERENCES relations (id) ON DELETE CASCADE,
  from_row_id uuid NOT NULL REFERENCES table_rows (id) ON DELETE CASCADE,
  to_row_id uuid NOT NULL REFERENCES table_rows (id) ON DELETE CASCADE,
  UNIQUE (relation_id, from_row_id, to_row_id)
);

CREATE INDEX relation_records_to_idx ON relation_records (to_row_id);
CREATE INDEX relation_records_from_idx ON relation_records (from_row_id);
