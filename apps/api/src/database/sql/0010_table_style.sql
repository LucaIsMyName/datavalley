ALTER TABLE tables ADD COLUMN format_rules jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE table_rows ADD COLUMN color text;

ALTER TABLE table_cells ADD COLUMN background text;

ALTER TABLE table_cells DROP CONSTRAINT table_cells_one_value;

ALTER TABLE table_cells ADD CONSTRAINT table_cells_one_value CHECK (
  (value_text IS NOT NULL)::integer
  + (value_number IS NOT NULL)::integer
  + (value_bool IS NOT NULL)::integer
  + (value_timestamptz IS NOT NULL)::integer
  + (value_jsonb IS NOT NULL)::integer
  <= 1
);
