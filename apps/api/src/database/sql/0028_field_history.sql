CREATE TABLE field_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  row_id uuid NOT NULL REFERENCES table_rows(id) ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES table_columns(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  before_text text NOT NULL DEFAULT '',
  after_text text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX field_history_row_idx ON field_history (row_id, created_at DESC);
