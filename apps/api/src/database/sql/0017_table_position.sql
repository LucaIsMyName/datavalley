ALTER TABLE tables ADD COLUMN position text NOT NULL DEFAULT 'a0';

WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY name, created_at) AS n
  FROM tables
)
UPDATE tables SET position = 'a' || lpad(ordered.n::text, 6, '0')
FROM ordered
WHERE tables.id = ordered.id;

CREATE INDEX tables_project_position_idx ON tables (project_id, position);
