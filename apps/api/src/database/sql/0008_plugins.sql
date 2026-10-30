CREATE TABLE plugins (
  id text PRIMARY KEY,
  name text NOT NULL,
  version text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('builtin', 'external')),
  enabled boolean NOT NULL DEFAULT false,
  entry text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plugin_configurations (
  plugin_id text PRIMARY KEY REFERENCES plugins (id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plugin_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id text NOT NULL REFERENCES plugins (id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects (id) ON DELETE CASCADE,
  name text NOT NULL,
  credentials_encrypted text,
  webhook_secret_hash text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plugin_permissions (
  plugin_id text NOT NULL REFERENCES plugins (id) ON DELETE CASCADE,
  scope text NOT NULL,
  PRIMARY KEY (plugin_id, scope)
);

CREATE TABLE integration_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES plugin_connections (id) ON DELETE CASCADE,
  status text NOT NULL,
  error text,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
