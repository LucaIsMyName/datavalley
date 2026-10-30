CREATE TABLE IF NOT EXISTS schema_meta (
  id integer PRIMARY KEY DEFAULT 1,
  note text NOT NULL,
  CONSTRAINT schema_meta_singleton CHECK (id = 1)
);

INSERT INTO schema_meta (id, note)
VALUES (1, 'datavalley')
ON CONFLICT (id) DO NOTHING;
