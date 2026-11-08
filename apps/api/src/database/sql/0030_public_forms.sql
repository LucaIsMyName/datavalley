CREATE TABLE public_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL UNIQUE REFERENCES tables(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  column_ids jsonb NOT NULL DEFAULT '[]',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
