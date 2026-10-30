CREATE TABLE formulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES tables (id) ON DELETE CASCADE,
  column_id uuid REFERENCES table_columns (id) ON DELETE CASCADE,
  source text NOT NULL,
  canonical text NOT NULL,
  ast jsonb NOT NULL,
  crosses_tables boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (column_id)
);

CREATE TABLE formula_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  formula_id uuid NOT NULL REFERENCES formulas (id) ON DELETE CASCADE,
  table_id uuid,
  column_id uuid,
  row_id uuid
);

CREATE INDEX formula_dependencies_column_idx ON formula_dependencies (column_id);

CREATE TABLE formula_cache (
  formula_id uuid NOT NULL REFERENCES formulas (id) ON DELETE CASCADE,
  row_id uuid NOT NULL REFERENCES table_rows (id) ON DELETE CASCADE,
  permission_hash text NOT NULL DEFAULT '',
  version_hash text NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY (formula_id, row_id, permission_hash)
);
