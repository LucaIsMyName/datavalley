INSERT INTO permission_grants (subject_type, subject_id, resource_type, resource_id, action, effect)
SELECT pm.subject_type, pm.subject_id, 'project', pm.resource_id, needed.action, 'allow'
FROM permission_grants pm
CROSS JOIN (VALUES ('create'), ('edit'), ('delete'), ('export'), ('import')) AS needed(action)
WHERE pm.subject_type = 'user'
  AND pm.resource_type = 'project'
  AND pm.action = 'view'
  AND pm.effect = 'allow'
  AND NOT EXISTS (
    SELECT 1
    FROM permission_grants other
    WHERE other.subject_type = pm.subject_type
      AND other.subject_id = pm.subject_id
      AND other.resource_type = 'project'
      AND other.resource_id IS NOT DISTINCT FROM pm.resource_id
      AND other.action <> 'view'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM permission_grants same
    WHERE same.subject_type = pm.subject_type
      AND same.subject_id = pm.subject_id
      AND same.resource_type = 'project'
      AND same.resource_id IS NOT DISTINCT FROM pm.resource_id
      AND same.action = needed.action
  );
