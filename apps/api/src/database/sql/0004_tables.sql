CREATE TABLE tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  header_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  footer_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE TABLE table_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES tables (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  position text NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  width integer NOT NULL DEFAULT 180,
  frozen boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_id, name)
);

CREATE INDEX table_columns_table_position_idx ON table_columns (table_id, position);

CREATE TABLE column_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id uuid NOT NULL REFERENCES table_columns (id) ON DELETE CASCADE,
  label text NOT NULL,
  color text,
  position text NOT NULL
);

CREATE TABLE table_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES tables (id) ON DELETE CASCADE,
  position text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX table_rows_table_position_idx ON table_rows (table_id, position, id);

CREATE TABLE table_cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES tables (id) ON DELETE CASCADE,
  row_id uuid NOT NULL REFERENCES table_rows (id) ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES table_columns (id) ON DELETE CASCADE,
  value_text text,
  value_number numeric(19, 4),
  value_bool boolean,
  value_timestamptz timestamptz,
  value_jsonb jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (row_id, column_id),
  CONSTRAINT table_cells_one_value CHECK (
    (value_text IS NOT NULL)::integer
    + (value_number IS NOT NULL)::integer
    + (value_bool IS NOT NULL)::integer
    + (value_timestamptz IS NOT NULL)::integer
    + (value_jsonb IS NOT NULL)::integer
    = 1
  )
);

CREATE INDEX table_cells_row_idx ON table_cells (row_id);
CREATE INDEX table_cells_column_text_idx ON table_cells (column_id, value_text);
CREATE INDEX table_cells_column_number_idx ON table_cells (column_id, value_number);
CREATE INDEX table_cells_column_time_idx ON table_cells (column_id, value_timestamptz);

CREATE TABLE user_favorites (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, resource_type, resource_id)
);

CREATE TABLE user_recent_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  resource_type text NOT NULL,
  resource_id uuid NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, resource_type, resource_id)
);
