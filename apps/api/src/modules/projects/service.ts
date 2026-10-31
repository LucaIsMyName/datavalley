import { and, asc, count, eq, inArray, isNotNull, isNull, max, notInArray, sql } from 'drizzle-orm'
import { escapeLike, isResourceIcon, projectOwnerActions, type Action } from '@datavalley/shared'
import type { AppDatabase } from '../../database/client.js'
import { permissionGrants, projectMembers, projects, tables, users } from '../../database/schema.js'
import { AppError, badRequest, notFound } from '../../errors.js'
import { allows, assertCan, resolveGrants, replaceGrants } from '../../security/access.js'
import { writeAudit } from '../../security/audit.js'
import type { Subject } from '../../security/subject.js'
import { seedCustomers, seedStarter } from '../tables/template.js'

type ProjectTableStats = { tableCount: number; latestTableEdit: Date | null }

async function projectTableStats(db: AppDatabase, projectIds: string[]) {
  if (projectIds.length === 0) return new Map<string, ProjectTableStats>()
  const rows = await db
    .select({
      projectId: tables.projectId,
      tableCount: count(),
      latestTableEdit: max(tables.updatedAt),
    })
    .from(tables)
    .where(and(inArray(tables.projectId, projectIds), isNull(tables.archivedAt)))
    .groupBy(tables.projectId)
  return new Map(
    rows.map((row) => [
      row.projectId,
      { tableCount: Number(row.tableCount), latestTableEdit: row.latestTableEdit ?? null },
    ]),
  )
}

function present(project: typeof projects.$inferSelect, stats?: ProjectTableStats) {
  const tableCount = stats?.tableCount ?? 0
  const projectUpdated = project.updatedAt.getTime()
  const tableUpdated = stats?.latestTableEdit?.getTime() ?? 0
  const lastEditedAt = new Date(Math.max(projectUpdated, tableUpdated)).toISOString()
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    icon: project.icon,
    organizationId: project.organizationId,
    archivedAt: project.archivedAt?.toISOString() ?? null,
    settings: project.settings,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    tableCount,
    lastEditedAt,
  }
}

export async function listProjects(db: AppDatabase, subject: Subject, includeArchived: boolean) {
  const grants = await db
    .select()
    .from(permissionGrants)
    .where(and(eq(permissionGrants.subjectType, subject.kind), eq(permissionGrants.subjectId, subject.id), eq(permissionGrants.action, 'view'), eq(permissionGrants.resourceType, 'project')))
  const allowed = new Set(grants.filter((grant) => grant.effect === 'allow' && grant.resourceId).map((grant) => grant.resourceId as string))
  const denied = new Set(grants.filter((grant) => grant.effect === 'deny' && grant.resourceId).map((grant) => grant.resourceId as string))
  const suspended = subject.kind === 'user'
    ? await db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(and(eq(projectMembers.userId, subject.id), isNotNull(projectMembers.disabledAt)))
    : []
  const suspendedIds = new Set(suspended.map((member) => member.projectId))
  const rows = await db.select().from(projects)
  const visible = rows
    .filter((project) => allowed.has(project.id) && !denied.has(project.id) && !suspendedIds.has(project.id))
    .filter((project) => includeArchived || !project.archivedAt)
  const stats = await projectTableStats(db, visible.map((project) => project.id))
  return visible.map((project) => present(project, stats.get(project.id)))
}

export async function createProject(
  db: AppDatabase,
  subject: Subject,
  input: { name: string; template?: 'blank' | 'customers' },
) {
  if (!subject.user) throw notFound()
  if (subject.role !== 'admin') throw new AppError(403, 'forbidden', 'Admin access is required')
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
    const stats = await projectTableStats(tx as unknown as AppDatabase, [project.id])
    return present(project, stats.get(project.id))
  })
}

export async function getProject(db: AppDatabase, subject: Subject, id: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
  if (!project) throw notFound()
  await assertCan(db, subject, 'view', { type: 'project', id: project.id })
  const stats = await projectTableStats(db, [project.id])
  return present(project, stats.get(project.id))
}

export async function updateProject(db: AppDatabase, subject: Subject, id: string, input: { name?: string; description?: string; settings?: Record<string, unknown>; icon?: string }) {
  await getProject(db, subject, id)
  await assertCan(db, subject, 'edit', { type: 'project', id })
  if (input.icon !== undefined && !isResourceIcon(input.icon)) throw badRequest('Unknown icon')
  const [project] = await db
    .update(projects)
    .set({
      name: input.name?.trim() || undefined,
      description: input.description,
      settings: input.settings,
      icon: input.icon,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning()
  const stats = await projectTableStats(db, [project.id])
  return present(project, stats.get(project.id))
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
  const stats = await projectTableStats(db, [project.id])
  return present(project, stats.get(project.id))
}

export async function deleteProject(db: AppDatabase, subject: Subject, id: string) {
  await getProject(db, subject, id)
  await assertCan(db, subject, 'delete', { type: 'project', id })
  await db.delete(projects).where(eq(projects.id, id))
  await writeAudit(db, subject, { action: 'project.delete', resourceType: 'project', resourceId: id })
}

async function projectRoster(db: AppDatabase, projectId: string) {
  return db
    .select({
      userId: projectMembers.userId,
      username: users.username,
      email: users.email,
      role: users.role,
      disabledAt: projectMembers.disabledAt,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
}

function presentMember(member: { userId: string; username: string; email: string; role: string; disabledAt: Date | null }) {
  return {
    userId: member.userId,
    username: member.username,
    email: member.email,
    role: member.role,
    disabled: Boolean(member.disabledAt),
  }
}

async function assertKeepsAdmin(db: AppDatabase, projectId: string, userId: string, mode: 'remove' | 'suspend') {
  const roster = await projectRoster(db, projectId)
  const target = roster.find((member) => member.userId === userId)
  if (!target) throw notFound()
  if (mode === 'remove' && roster.length <= 1) throw badRequest('A project must keep an administrator')
  const activeAdmins = roster.filter((member) => member.role === 'admin' && !member.disabledAt)
  const targetIsActiveAdmin = target.role === 'admin' && !target.disabledAt
  if (targetIsActiveAdmin && activeAdmins.length <= 1) throw badRequest('A project must keep an administrator')
  return target
}

export async function listMembers(db: AppDatabase, subject: Subject, projectId: string) {
  await getProject(db, subject, projectId)
  const grants = await resolveGrants(db, subject)
  const canManage = allows(subject, grants, 'manage_permissions', { type: 'project', id: projectId })
  const members = await projectRoster(db, projectId)
  return { members: members.map(presentMember), canManage }
}

export async function listDirectory(db: AppDatabase, subject: Subject, projectId: string, query: string) {
  const project = await getProject(db, subject, projectId)
  const grants = await resolveGrants(db, subject)
  if (!allows(subject, grants, 'manage_permissions', { type: 'project', id: projectId })) {
    throw new AppError(403, 'forbidden', 'Permission required')
  }
  const members = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId))
  const memberIds = members.map((member) => member.userId)
  const q = query.trim()
  const filters = [eq(users.organizationId, project.organizationId)]
  if (memberIds.length > 0) filters.push(notInArray(users.id, memberIds))
  if (q) {
    const pattern = `%${escapeLike(q)}%`
    filters.push(sql`(${users.username} ILIKE ${pattern} ESCAPE '\\' OR ${users.email} ILIKE ${pattern} ESCAPE '\\')`)
  }
  return db
    .select({ id: users.id, username: users.username, email: users.email })
    .from(users)
    .where(and(...filters))
    .orderBy(asc(users.username))
    .limit(q ? 20 : 8)
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
  await assertKeepsAdmin(db, projectId, userId, 'remove')
  await db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
  const grants = await db.select().from(permissionGrants).where(and(eq(permissionGrants.subjectId, userId), eq(permissionGrants.resourceId, projectId)))
  for (const grant of grants) await db.delete(permissionGrants).where(eq(permissionGrants.id, grant.id))
  await writeAudit(db, subject, { action: 'project.member.remove', resourceType: 'project', resourceId: projectId, metadata: { userId } })
}

export async function setMemberDisabled(db: AppDatabase, subject: Subject, projectId: string, userId: string, disabled: boolean) {
  await assertCan(db, subject, 'manage_permissions', { type: 'project', id: projectId })
  if (disabled) await assertKeepsAdmin(db, projectId, userId, 'suspend')
  else {
    const roster = await projectRoster(db, projectId)
    if (!roster.some((member) => member.userId === userId)) throw notFound()
  }
  const [updated] = await db
    .update(projectMembers)
    .set({ disabledAt: disabled ? new Date() : null })
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .returning()
  if (!updated) throw notFound()
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) throw notFound()
  await writeAudit(db, subject, {
    action: disabled ? 'project.member.disable' : 'project.member.enable',
    resourceType: 'project',
    resourceId: projectId,
    metadata: { userId },
  })
  return presentMember({ ...updated, username: user.username, email: user.email, role: user.role })
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
