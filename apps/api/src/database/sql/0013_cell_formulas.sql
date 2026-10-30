ALTER TABLE formulas ADD COLUMN IF NOT EXISTS row_id uuid REFERENCES table_rows (id) ON DELETE CASCADE;

ALTER TABLE formulas DROP CONSTRAINT IF EXISTS formulas_column_id_key;

INSERT INTO formulas (table_id, column_id, row_id, source, canonical, ast, crosses_tables, created_at, updated_at)
SELECT f.table_id, f.column_id, r.id, f.source, f.canonical, f.ast, f.crosses_tables, now(), now()
FROM formulas f
JOIN table_rows r ON r.table_id = f.table_id
WHERE f.row_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM formulas existing
    WHERE existing.column_id = f.column_id AND existing.row_id = r.id
  );

DELETE FROM formulas WHERE row_id IS NULL;

ALTER TABLE formulas ALTER COLUMN row_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS formulas_column_row_idx ON formulas (column_id, row_id);
