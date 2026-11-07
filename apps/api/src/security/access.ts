import { and, eq } from 'drizzle-orm'
import { canSubject, type Action, type Grant, type ResourceRef, type ResourceType } from '@datavalley/shared'
import { permissionGrants, projectMembers } from '../database/schema.js'
import type { AppDatabase } from '../database/client.js'
import { notFound } from '../errors.js'
import { cachedGrants } from './request-context.js'
import { invalidateGrantsCache, readGrantsCache, writeGrantsCache } from './grants-cache.js'
import type { Subject } from './subject.js'

async function queryGrantsFromDb(db: AppDatabase, subject: Subject): Promise<Grant[]> {
  const rows = await db
    .select()
    .from(permissionGrants)
    .where(and(eq(permissionGrants.subjectType, subject.kind), eq(permissionGrants.subjectId, subject.id)))
  return rows.map((row) => ({
    resourceType: row.resourceType as ResourceType,
    resourceId: row.resourceId,
    action: row.action as Action,
    effect: row.effect as 'allow' | 'deny',
  }))
}

export async function loadGrants(db: AppDatabase, subject: Subject): Promise<Grant[]> {
  if (process.env.NODE_ENV === 'test') return queryGrantsFromDb(db, subject)
  const cached = readGrantsCache(subject)
  if (cached) return cached
  const grants = await queryGrantsFromDb(db, subject)
  writeGrantsCache(subject, grants)
  return grants
}

export function allows(subject: Subject, grants: Grant[], action: Action, resource: ResourceRef) {
  return canSubject({ role: subject.role }, grants, action, resource)
}

export async function resolveGrants(db: AppDatabase, subject: Subject): Promise<Grant[]> {
  const cached = cachedGrants()
  if (cached !== undefined) return cached
  return loadGrants(db, subject)
}

export async function assertCan(db: AppDatabase, subject: Subject, action: Action, resource: ResourceRef) {
  const grants = await resolveGrants(db, subject)
  if (!allows(subject, grants, action, resource)) throw notFound()
  const projectId = resource.type === 'project' ? resource.id : resource.parents?.project
  if (projectId && subject.kind === 'user') {
    const [membership] = await db
      .select({ disabledAt: projectMembers.disabledAt })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, subject.id)))
      .limit(1)
    if (membership?.disabledAt) throw notFound()
  }
  return grants
}

export async function replaceGrants(
  db: AppDatabase,
  subject: { kind: 'user' | 'api_key'; id: string },
  resourceType: ResourceType,
  resourceId: string | null,
  grants: { action: Action; effect: 'allow' | 'deny' }[],
) {
  await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(permissionGrants)
      .where(and(eq(permissionGrants.subjectType, subject.kind), eq(permissionGrants.subjectId, subject.id)))
    const doomed = existing.filter(
      (row) => row.resourceType === resourceType && (row.resourceId ?? null) === resourceId,
    )
    for (const row of doomed) {
      await tx.delete(permissionGrants).where(eq(permissionGrants.id, row.id))
    }
    if (grants.length) {
      await tx.insert(permissionGrants).values(
        grants.map((grant) => ({
          subjectType: subject.kind,
          subjectId: subject.id,
          resourceType,
          resourceId,
          action: grant.action,
          effect: grant.effect,
        })),
      )
    }
  })
  invalidateGrantsCache(subject)
}
