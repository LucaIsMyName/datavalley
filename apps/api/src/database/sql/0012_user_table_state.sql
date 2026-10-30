CREATE TABLE user_table_state (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES tables (id) ON DELETE CASCADE,
  sort jsonb,
  filter jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, table_id)
);
