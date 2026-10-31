ALTER TABLE audit_logs
  ALTER COLUMN resource_id TYPE text USING resource_id::text;
