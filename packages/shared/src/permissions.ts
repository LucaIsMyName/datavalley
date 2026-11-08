export const resourceTypes = ['cell', 'row', 'column', 'table', 'project', 'system'] as const
export type ResourceType = (typeof resourceTypes)[number]

export const actions = [
  'view',
  'create',
  'edit',
  'delete',
  'export',
  'import',
  'share',
  'manage_permissions',
  'manage_structure',
  'manage_users',
  'manage_settings',
  'manage_plugins',
  'manage_api_keys',
  'view_audit',
] as const
export type Action = (typeof actions)[number]

export const projectOwnerActions = [
  'view',
  'create',
  'edit',
  'delete',
  'export',
  'import',
  'share',
  'manage_permissions',
  'manage_structure',
] as const satisfies readonly Action[]

/** Grants written when someone is added to a project. Structure and access changes stay separate. */
export const projectMemberActions = ['view', 'create', 'edit', 'delete', 'export', 'import'] as const satisfies readonly Action[]

export const grantPresetIds = ['full', 'sales', 'view'] as const
export type GrantPresetId = (typeof grantPresetIds)[number]

/** full edits the project, sales edits rows, view is read-only. */
export const grantPresets: Record<GrantPresetId, readonly Action[]> = {
  full: projectOwnerActions,
  sales: projectMemberActions,
  view: ['view'],
}

export function isGrantPresetId(value: string): value is GrantPresetId {
  return (grantPresetIds as readonly string[]).includes(value)
}

export function grantPresetId(actions: Iterable<string>): GrantPresetId {
  const have = new Set(actions)
  if (have.has('manage_structure')) return 'full'
  if (have.has('edit')) return 'sales'
  return 'view'
}

export type Effect = 'allow' | 'deny'

export type Grant = {
  resourceType: ResourceType
  resourceId: string | null
  action: Action
  effect: Effect
}

export type ResourceRef = {
  type: ResourceType
  id: string | null
  parents?: Partial<Record<ResourceType, string | null>>
}

const ancestorChains: Record<ResourceType, ResourceType[]> = {
  cell: ['cell', 'row', 'column', 'table', 'project', 'system'],
  row: ['row', 'table', 'project', 'system'],
  column: ['column', 'table', 'project', 'system'],
  table: ['table', 'project', 'system'],
  project: ['project', 'system'],
  system: ['system'],
}

export function resourceChain(resource: ResourceRef): { type: ResourceType; id: string | null }[] {
  return ancestorChains[resource.type].map((type) => {
    if (type === resource.type) return { type, id: resource.id }
    if (type === 'system') return { type, id: null }
    return { type, id: resource.parents?.[type] ?? null }
  })
}

export function decide(grants: Grant[], action: Action, resource: ResourceRef): boolean {
  for (const node of resourceChain(resource)) {
    const atLevel = grants.filter(
      (grant) =>
        grant.action === action &&
        grant.resourceType === node.type &&
        (grant.resourceId ?? null) === (node.id ?? null),
    )
    if (atLevel.length === 0) continue
    if (atLevel.some((grant) => grant.effect === 'deny')) return false
    if (atLevel.some((grant) => grant.effect === 'allow')) return true
    return false
  }
  return false
}

export function canSubject(
  subject: { role: 'admin' | 'user' | 'service' },
  grants: Grant[],
  action: Action,
  resource: ResourceRef,
): boolean {
  if (subject.role === 'admin' && resource.type === 'system') return true
  return decide(grants, action, resource)
}
