ALTER TABLE media_files
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects (id) ON DELETE SET NULL;

UPDATE media_files m
SET
  organization_id = p.organization_id,
  project_id = t.project_id
FROM tables t
JOIN projects p ON p.id = t.project_id
WHERE m.table_id = t.id
  AND m.organization_id IS NULL;

DELETE FROM media_files WHERE organization_id IS NULL;

ALTER TABLE media_files ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS media_files_organization_created_idx ON media_files (organization_id, created_at DESC);
