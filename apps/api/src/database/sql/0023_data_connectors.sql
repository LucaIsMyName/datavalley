CREATE TABLE data_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'Globe',
  enabled boolean NOT NULL DEFAULT true,
  source jsonb NOT NULL DEFAULT '{}',
  auth jsonb NOT NULL DEFAULT '{"type":"none"}',
  format text NOT NULL CHECK (format IN ('json', 'csv', 'xml', 'html')),
  parse jsonb NOT NULL DEFAULT '{"version":1,"fields":[]}',
  schedule jsonb NOT NULL DEFAULT '{"preset":"manual","timezone":"UTC"}',
  retention jsonb NOT NULL DEFAULT '{"mode":"forever"}',
  auth_secret_encrypted text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX data_connectors_org_idx ON data_connectors(organization_id);
CREATE INDEX data_connectors_project_idx ON data_connectors(project_id) WHERE project_id IS NOT NULL;

CREATE TABLE table_connector_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL UNIQUE REFERENCES tables(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES data_connectors(id) ON DELETE CASCADE,
  column_map jsonb NOT NULL DEFAULT '{}',
  sync_mode text NOT NULL DEFAULT 'upsert' CHECK (sync_mode IN ('append_only', 'upsert')),
  last_sync_at timestamptz,
  last_sync_status text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX table_connector_bindings_connector_idx ON table_connector_bindings(connector_id);

CREATE TABLE connector_row_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  external_key text NOT NULL,
  row_id uuid NOT NULL REFERENCES table_rows(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_id, external_key)
);

CREATE INDEX connector_row_links_row_idx ON connector_row_links(row_id);

CREATE TABLE connector_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id uuid NOT NULL REFERENCES data_connectors(id) ON DELETE CASCADE,
  table_id uuid REFERENCES tables(id) ON DELETE SET NULL,
  status text NOT NULL,
  error text,
  stats jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX connector_sync_jobs_connector_idx ON connector_sync_jobs(connector_id, created_at DESC);
