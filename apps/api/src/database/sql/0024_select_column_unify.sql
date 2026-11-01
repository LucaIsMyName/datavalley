UPDATE table_columns
SET
  type = 'select',
  config = COALESCE(config, '{}'::jsonb) || '{"multiple": true}'::jsonb
WHERE type = 'multi_select';

UPDATE table_columns
SET
  type = 'select',
  config = COALESCE(config, '{}'::jsonb) || '{"multiple": false}'::jsonb
WHERE type = 'radio';
