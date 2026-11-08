import { and, asc, count, eq, inArray, isNotNull, isNull, max, notInArray, sql } from 'drizzle-orm'
import {
  escapeLike,
  grantPresetId,
  grantPresets,
  isResourceIcon,
  projectMemberActions,
  projectOwnerActions,
  type Action,
  type GrantPresetId,
} from '@datavalley/shared'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { passwordResetTokens, permissionGrants, projectMembers, projects, tables, users } from '../../database/schema.js'
import { sendMail } from '../../mail/smtp.js'
import { sha256, randomToken } from '../../security/crypto.js'
import { hashPassword } from '../../security/passwords.js'
import { AppError, badRequest, conflict, notFound } from '../../errors.js'
import { allows, assertCan, resolveGrants, replaceGrants } from '../../security/access.js'
import { invalidateGrantsCache } from '../../security/grants-cache.js'
import { writeAudit } from '../../security/audit.js'
import type { Subject } from '../../security/subject.js'
import { seedCrm, seedCustomers, seedQuotes, seedStarter } from '../tables/template.js'
import { publishRealtime } from '../realtime/publish.js'

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
  input: { name: string; template?: 'blank' | 'customers' | 'crm' | 'quotes' },
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
    if (input.template === 'crm') {
      await seedCrm(tx as unknown as AppDatabase, project.id, subject.id)
    } else if (input.template === 'quotes') {
      await seedQuotes(tx as unknown as AppDatabase, project.id, subject.id)
    } else {
      await seedStarter(tx as unknown as AppDatabase, project.id, subject.id)
      if (input.template === 'customers') await seedCustomers(tx as unknown as AppDatabase, project.id, subject.id)
    }
    await writeAudit(tx as unknown as AppDatabase, subject, { action: 'project.create', resourceType: 'project', resourceId: project.id })
    const stats = await projectTableStats(tx as unknown as AppDatabase, [project.id])
    invalidateGrantsCache(subject)
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
  const presented = present(project, stats.get(project.id))
  publishRealtime(presented.id, {
    type: 'project.updated',
    actorId: subject.id,
    project: {
      id: presented.id,
      name: presented.name,
      description: presented.description ?? '',
      icon: presented.icon,
    },
  })
  return presented
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

function presentMember(
  member: { userId: string; username: string; email: string; role: string; disabledAt: Date | null },
  preset: GrantPresetId = 'view',
) {
  return {
    userId: member.userId,
    username: member.username,
    email: member.email,
    role: member.role,
    disabled: Boolean(member.disabledAt),
    preset,
  }
}

async function presetsFor(db: AppDatabase, projectId: string, userIds: string[]) {
  const presets = new Map<string, GrantPresetId>()
  if (userIds.length === 0) return presets
  const grants = await db
    .select({ subjectId: permissionGrants.subjectId, action: permissionGrants.action, effect: permissionGrants.effect })
    .from(permissionGrants)
    .where(
      and(
        eq(permissionGrants.subjectType, 'user'),
        inArray(permissionGrants.subjectId, userIds),
        eq(permissionGrants.resourceType, 'project'),
        eq(permissionGrants.resourceId, projectId),
        eq(permissionGrants.effect, 'allow'),
      ),
    )
  const byUser = new Map<string, string[]>()
  for (const grant of grants) {
    const list = byUser.get(grant.subjectId) ?? []
    list.push(grant.action)
    byUser.set(grant.subjectId, list)
  }
  for (const userId of userIds) presets.set(userId, grantPresetId(byUser.get(userId) ?? []))
  return presets
}

async function applyPreset(db: AppDatabase, projectId: string, userId: string, preset: GrantPresetId) {
  if (preset !== 'full') {
    const presets = await presetsFor(db, projectId, (await projectRoster(db, projectId)).map((member) => member.userId))
    const managers = [...presets.entries()].filter(([, current]) => current === 'full')
    if (presets.get(userId) === 'full' && managers.length <= 1) {
      throw badRequest('A project must keep someone who can manage access')
    }
  }
  await replaceGrants(
    db,
    { kind: 'user', id: userId },
    'project',
    projectId,
    grantPresets[preset].map((action) => ({ action, effect: 'allow' as const })),
  )
  invalidateGrantsCache({ kind: 'user', id: userId })
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
  const presets = await presetsFor(db, projectId, members.map((member) => member.userId))
  return { members: members.map((member) => presentMember(member, presets.get(member.userId))), canManage }
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

export async function addMember(
  db: AppDatabase,
  subject: Subject,
  projectId: string,
  username: string,
  preset?: GrantPresetId,
) {
  await assertCan(db, subject, 'manage_permissions', { type: 'project', id: projectId })
  const [user] = await db.select().from(users).where(eq(users.username, username.trim().toLowerCase())).limit(1)
  if (!user) throw notFound()
  await db.insert(projectMembers).values({ projectId, userId: user.id }).onConflictDoNothing()
  if (preset) await applyPreset(db, projectId, user.id, preset)
  else {
    const existing = await db
      .select({ action: permissionGrants.action })
      .from(permissionGrants)
      .where(
        and(
          eq(permissionGrants.subjectType, 'user'),
          eq(permissionGrants.subjectId, user.id),
          eq(permissionGrants.resourceType, 'project'),
          eq(permissionGrants.resourceId, projectId),
        ),
      )
    const have = new Set(existing.map((grant) => grant.action))
    const missing = projectMemberActions.filter((action) => !have.has(action))
    if (missing.length) {
      await db.insert(permissionGrants).values(
        missing.map((action) => ({
          subjectType: 'user' as const,
          subjectId: user.id,
          resourceType: 'project' as const,
          resourceId: projectId,
          action,
          effect: 'allow' as const,
        })),
      )
    }
    invalidateGrantsCache({ kind: 'user', id: user.id })
  }
  await writeAudit(db, subject, { action: 'project.member.add', resourceType: 'project', resourceId: projectId, metadata: { userId: user.id, preset: preset ?? 'sales' } })
  const presets = await presetsFor(db, projectId, [user.id])
  return presentMember(
    { userId: user.id, username: user.username, email: user.email, role: user.role, disabledAt: null },
    presets.get(user.id),
  )
}

export async function removeMember(db: AppDatabase, subject: Subject, projectId: string, userId: string) {
  await assertCan(db, subject, 'manage_permissions', { type: 'project', id: projectId })
  await assertKeepsAdmin(db, projectId, userId, 'remove')
  await db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
  const grants = await db.select().from(permissionGrants).where(and(eq(permissionGrants.subjectId, userId), eq(permissionGrants.resourceId, projectId)))
  for (const grant of grants) await db.delete(permissionGrants).where(eq(permissionGrants.id, grant.id))
  invalidateGrantsCache({ kind: 'user', id: userId })
  await writeAudit(db, subject, { action: 'project.member.remove', resourceType: 'project', resourceId: projectId, metadata: { userId } })
}

export async function setMemberDisabled(
  db: AppDatabase,
  subject: Subject,
  projectId: string,
  userId: string,
  input: { disabled?: boolean; preset?: GrantPresetId },
) {
  await assertCan(db, subject, 'manage_permissions', { type: 'project', id: projectId })
  if (input.disabled == null && !input.preset) throw badRequest('Choose a change')
  const roster = await projectRoster(db, projectId)
  if (!roster.some((member) => member.userId === userId)) throw notFound()
  if (input.preset) await applyPreset(db, projectId, userId, input.preset)
  let updatedAt = roster.find((member) => member.userId === userId)?.disabledAt ?? null
  if (input.disabled != null) {
    if (input.disabled) await assertKeepsAdmin(db, projectId, userId, 'suspend')
    const [updated] = await db
      .update(projectMembers)
      .set({ disabledAt: input.disabled ? new Date() : null })
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
      .returning()
    if (!updated) throw notFound()
    updatedAt = updated.disabledAt
    await writeAudit(db, subject, {
      action: input.disabled ? 'project.member.disable' : 'project.member.enable',
      resourceType: 'project',
      resourceId: projectId,
      metadata: { userId },
    })
  }
  if (input.preset) {
    await writeAudit(db, subject, {
      action: 'permission.change',
      resourceType: 'project',
      resourceId: projectId,
      metadata: { userId, preset: input.preset },
    })
  }
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) throw notFound()
  const presets = await presetsFor(db, projectId, [userId])
  return presentMember(
    { userId, username: user.username, email: user.email, role: user.role, disabledAt: updatedAt },
    presets.get(userId),
  )
}

const INVITE_MS = 7 * 24 * 60 * 60 * 1000
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function usernameFromEmail(email: string) {
  const local = email.split('@')[0] ?? 'user'
  const cleaned = local.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 28)
  return (cleaned.length >= 3 ? cleaned : `user${cleaned}`).slice(0, 32)
}

export async function inviteMember(
  db: AppDatabase,
  env: Env,
  subject: Subject,
  projectId: string,
  email: string,
  preset: GrantPresetId = 'sales',
) {
  await assertCan(db, subject, 'manage_permissions', { type: 'project', id: projectId })
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!project) throw notFound()
  const address = email.trim().toLowerCase()
  if (!emailPattern.test(address)) throw badRequest('Enter an email address')
  const [existing] = await db.select().from(users).where(eq(users.email, address)).limit(1)
  let user = existing
  let created = false
  if (user && user.organizationId !== project.organizationId) throw conflict('Email is already in use')
  if (!user) {
    if (!subject.user) throw notFound()
    let username = usernameFromEmail(address)
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = attempt === 0 ? username : `${username.slice(0, 28)}${attempt + 1}`
      const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, candidate)).limit(1)
      if (!taken) {
        username = candidate
        break
      }
    }
    const [inserted] = await db
      .insert(users)
      .values({
        organizationId: subject.user.organizationId,
        username,
        email: address,
        passwordHash: await hashPassword(randomToken(18), env),
        role: 'user',
        mustChangePassword: true,
      })
      .returning()
    user = inserted
    created = true
    await writeAudit(db, subject, { action: 'user.create', resourceType: 'user', resourceId: user.id, metadata: { username: user.username, invite: true } })
  }
  const roster = await projectRoster(db, projectId)
  const already = roster.some((member) => member.userId === user.id)
  if (already && !user.mustChangePassword) throw conflict('That person is already a member')
  if (!already) await db.insert(projectMembers).values({ projectId, userId: user.id })
  await applyPreset(db, projectId, user.id, preset)
  let inviteUrl: string | undefined
  const origin = env.WEB_ORIGIN.replace(/\/$/, '')
  if (created || user.mustChangePassword) {
    const token = randomToken(32)
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + INVITE_MS),
    })
    inviteUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`
    try {
      await sendMail(env, {
        to: user.email,
        subject: `Invitation to ${project.name}`,
        text: `You were invited to ${project.name} on Datavalley.\nSet your password:\n${inviteUrl}\n\nThis link expires in 7 days.`,
      })
    } catch {
      // The account and grant are saved. Mail delivery stays best-effort.
    }
  } else {
    try {
      await sendMail(env, {
        to: user.email,
        subject: `Added to ${project.name}`,
        text: `You were added to ${project.name} on Datavalley.\n${origin}/projects/${project.id}`,
      })
    } catch {
      // Membership is saved. Mail delivery stays best-effort.
    }
  }
  await writeAudit(db, subject, {
    action: 'project.member.invite',
    resourceType: 'project',
    resourceId: projectId,
    metadata: { userId: user.id, preset },
  })
  const presets = await presetsFor(db, projectId, [user.id])
  const member = presentMember(
    { userId: user.id, username: user.username, email: user.email, role: user.role, disabledAt: null },
    presets.get(user.id),
  )
  return env.NODE_ENV === 'test' ? { member, inviteUrl } : { member }
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
