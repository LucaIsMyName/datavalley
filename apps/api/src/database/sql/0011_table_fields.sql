ALTER TABLE projects ADD COLUMN description text NOT NULL DEFAULT '';

ALTER TABLE tables ADD COLUMN next_row_number integer NOT NULL DEFAULT 1;

ALTER TABLE table_rows ADD COLUMN notes text NOT NULL DEFAULT '';
ALTER TABLE table_rows ADD COLUMN row_number integer NOT NULL DEFAULT 0;

WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY table_id ORDER BY position, id) AS n
  FROM table_rows
)
UPDATE table_rows AS r
SET row_number = numbered.n
FROM numbered
WHERE r.id = numbered.id;

UPDATE tables AS t
SET next_row_number = COALESCE((SELECT max(row_number) + 1 FROM table_rows AS r WHERE r.table_id = t.id), 1);

CREATE TABLE table_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES tables (id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL
);

CREATE UNIQUE INDEX table_tags_name_idx ON table_tags (table_id, lower(name));

CREATE TABLE table_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES tables (id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL,
  position text NOT NULL
);

CREATE UNIQUE INDEX table_statuses_name_idx ON table_statuses (table_id, lower(name));
