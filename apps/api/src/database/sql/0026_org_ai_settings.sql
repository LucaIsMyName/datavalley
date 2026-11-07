CREATE TABLE organization_ai_settings (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model text NOT NULL,
  base_url text,
  enabled boolean NOT NULL DEFAULT false,
  api_key_encrypted text,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
