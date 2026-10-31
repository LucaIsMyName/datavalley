ALTER TABLE table_cells ADD COLUMN format_rules jsonb NOT NULL DEFAULT '[]'::jsonb;
