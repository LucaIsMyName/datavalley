import { and, eq, isNull } from 'drizzle-orm'
import { projectOwnerActions, type Action } from '@datavalley/shared'
import type { AppDatabase } from '../../database/client.js'
import { permissionGrants, projectMembers, projects, users } from '../../database/schema.js'
import { badRequest, notFound } from '../../errors.js'
import { assertCan, replaceGrants } from '../../security/access.js'
import { writeAudit } from '../../security/audit.js'
import type { Subject } from '../../security/subject.js'
import { seedCustomers, seedStarter } from '../tables/template.js'

function present(project: typeof projects.$inferSelect) {
  return {
    id: project.id,
    name: project.name,
    organizationId: project.organizationId,
    archivedAt: project.archivedAt?.toISOString() ?? null,
    settings: project.settings,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  }
}

export async function listProjects(db: AppDatabase, subject: Subject, includeArchived: boolean) {
  const grants = await db
    .select()
    .from(permissionGrants)
    .where(and(eq(permissionGrants.subjectType, subject.kind), eq(permissionGrants.subjectId, subject.id), eq(permissionGrants.action, 'view'), eq(permissionGrants.resourceType, 'project')))
  const allowed = new Set(grants.filter((grant) => grant.effect === 'allow' && grant.resourceId).map((grant) => grant.resourceId as string))
  const denied = new Set(grants.filter((grant) => grant.effect === 'deny' && grant.resourceId).map((grant) => grant.resourceId as string))
  const rows = await db.select().from(projects)
  return rows
    .filter((project) => allowed.has(project.id) && !denied.has(project.id))
    .filter((project) => includeArchived || !project.archivedAt)
    .map(present)
}

export async function createProject(
  db: AppDatabase,
  subject: Subject,
  input: { name: string; template?: 'blank' | 'customers' },
) {
  if (!subject.user) throw notFound()
  const name = input.name.trim()
  if (!name) throw badRequest('Project name is required')
  return db.transaction(async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({ organizationId: subject.user!.organizationId, name, createdBy: subject.id })
      .returning()
    await tx.insert(projectMembers).values({ projectId: project.id, userId: subject.id })
    await tx.insert(permissionGrants).values(
      projectOwnerActions.map((action) => ({
        subjectType: subject.kind,
        subjectId: subject.id,
        resourceType: 'project',
        resourceId: project.id,
        action,
        effect: 'allow' as const,
      })),
    )
    await seedStarter(tx as unknown as AppDatabase, project.id, subject.id)
    if (input.template === 'customers') await seedCustomers(tx as unknown as AppDatabase, project.id, subject.id)
    await writeAudit(tx as unknown as AppDatabase, subject, { action: 'project.create', resourceType: 'project', resourceId: project.id })
    return present(project)
  })
}

export async function getProject(db: AppDatabase, subject: Subject, id: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
  if (!project) throw notFound()
  await assertCan(db, subject, 'view', { type: 'project', id: project.id })
  return present(project)
}

export async function updateProject(db: AppDatabase, subject: Subject, id: string, input: { name?: string; settings?: Record<string, unknown> }) {
  await getProject(db, subject, id)
  await assertCan(db, subject, 'edit', { type: 'project', id })
  const [project] = await db
    .update(projects)
    .set({
      name: input.name?.trim() || undefined,
      settings: input.settings,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning()
  return present(project)
}

export async function setArchived(db: AppDatabase, subject: Subject, id: string, archived: boolean) {
  await getProject(db, subject, id)
  await assertCan(db, subject, 'edit', { type: 'project', id })
  const [project] = await db
    .update(projects)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning()
  await writeAudit(db, subject, { action: archived ? 'project.archive' : 'project.restore', resourceType: 'project', resourceId: id })
  return present(project)
}

export async function deleteProject(db: AppDatabase, subject: Subject, id: string) {
  await getProject(db, subject, id)
  await assertCan(db, subject, 'delete', { type: 'project', id })
  await db.delete(projects).where(eq(projects.id, id))
  await writeAudit(db, subject, { action: 'project.delete', resourceType: 'project', resourceId: id })
}

export async function listMembers(db: AppDatabase, subject: Subject, projectId: string) {
  await getProject(db, subject, projectId)
  const members = await db
    .select({ userId: projectMembers.userId, username: users.username, email: users.email })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
  return members
}

export async function addMember(db: AppDatabase, subject: Subject, projectId: string, username: string) {
  await assertCan(db, subject, 'manage_permissions', { type: 'project', id: projectId })
  const [user] = await db.select().from(users).where(eq(users.username, username.trim().toLowerCase())).limit(1)
  if (!user) throw notFound()
  await db.insert(projectMembers).values({ projectId, userId: user.id }).onConflictDoNothing()
  await db.insert(permissionGrants).values({
    subjectType: 'user',
    subjectId: user.id,
    resourceType: 'project',
    resourceId: projectId,
    action: 'view',
    effect: 'allow',
  })
  await writeAudit(db, subject, { action: 'project.member.add', resourceType: 'project', resourceId: projectId, metadata: { userId: user.id } })
  return { userId: user.id, username: user.username, email: user.email }
}

export async function removeMember(db: AppDatabase, subject: Subject, projectId: string, userId: string) {
  await assertCan(db, subject, 'manage_permissions', { type: 'project', id: projectId })
  await db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
  const grants = await db.select().from(permissionGrants).where(and(eq(permissionGrants.subjectId, userId), eq(permissionGrants.resourceId, projectId)))
  for (const grant of grants) await db.delete(permissionGrants).where(eq(permissionGrants.id, grant.id))
  await writeAudit(db, subject, { action: 'project.member.remove', resourceType: 'project', resourceId: projectId, metadata: { userId } })
}

export async function setProjectGrants(
  db: AppDatabase,
  subject: Subject,
  projectId: string,
  userId: string,
  grants: { action: Action; effect: 'allow' | 'deny' }[],
) {
  await assertCan(db, subject, 'manage_permissions', { type: 'project', id: projectId })
  await replaceGrants(db, { kind: 'user', id: userId }, 'project', projectId, grants)
  await writeAudit(db, subject, {
    action: 'permission.change',
    resourceType: 'project',
    resourceId: projectId,
    metadata: { userId, grants },
  })
}

export async function activeProjects(db: AppDatabase) {
  return db.select().from(projects).where(isNull(projects.archivedAt))
}
