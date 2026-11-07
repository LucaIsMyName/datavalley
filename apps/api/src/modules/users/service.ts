import { and, eq } from 'drizzle-orm'
import type { Action } from '@datavalley/shared'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { permissionGrants, users } from '../../database/schema.js'
import { badRequest, conflict, notFound } from '../../errors.js'
import { replaceGrants } from '../../security/access.js'
import { writeAudit } from '../../security/audit.js'
import { invalidateGrantsCache } from '../../security/grants-cache.js'
import { assertPassword, hashPassword } from '../../security/passwords.js'
import type { Subject } from '../../security/subject.js'
import { publicUser } from '../auth/service.js'

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/

function assertUsername(username: string) {
  if (!USERNAME_PATTERN.test(username)) throw badRequest('Username must be 3-32 characters')
}

function uniqueIdentityConflict(error: unknown): never {
  const texts: string[] = []
  let current: unknown = error
  for (let i = 0; i < 5 && current && typeof current === 'object'; i++) {
    const rec = current as { code?: string; constraint?: string; message?: string; detail?: string; cause?: unknown }
    texts.push(`${rec.constraint ?? ''} ${rec.message ?? ''} ${rec.detail ?? ''} ${rec.code ?? ''}`)
    const blob = texts.join(' ').toLowerCase()
    if (rec.code === '23505' || blob.includes('unique') || blob.includes('duplicate')) {
      if (blob.includes('email')) throw conflict('Email is already in use')
      throw conflict('Username is already in use')
    }
    current = rec.cause
  }
  throw error
}

async function assertKeepsOrgAdmin(db: AppDatabase, userId: string) {
  const [target] = await db
    .select({ id: users.id, role: users.role, disabledAt: users.disabledAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!target) throw notFound()
  if (target.role !== 'admin' || target.disabledAt) return
  const admins = await db.select({ id: users.id, disabledAt: users.disabledAt }).from(users).where(eq(users.role, 'admin'))
  const active = admins.filter((row) => !row.disabledAt)
  if (active.length <= 1) throw badRequest('An organization must keep an administrator')
}

export async function listUsers(db: AppDatabase, offset: number, limit: number) {
  const rows = await db.select().from(users).offset(offset).limit(limit)
  return rows.map(publicUser)
}

export async function createUser(
  db: AppDatabase,
  env: Env,
  actor: Subject,
  input: { username: string; email: string; password: string; role: 'admin' | 'user' },
) {
  if (!actor.user) throw notFound()
  assertPassword(input.password, input.username)
  assertUsername(input.username)
  try {
    const [user] = await db
      .insert(users)
      .values({
        organizationId: actor.user.organizationId,
        username: input.username.toLowerCase(),
        email: input.email.toLowerCase(),
        passwordHash: await hashPassword(input.password, env),
        role: input.role,
        mustChangePassword: true,
      })
      .returning()
    await writeAudit(db, actor, { action: 'user.create', resourceType: 'user', resourceId: user.id, metadata: { username: user.username } })
    return publicUser(user)
  } catch (error) {
    uniqueIdentityConflict(error)
  }
}

export async function getUser(db: AppDatabase, actor: Subject, id: string) {
  if (actor.role !== 'admin' && actor.id !== id) throw notFound()
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!user) throw notFound()
  return publicUser(user)
}

export async function updateUser(
  db: AppDatabase,
  actor: Subject,
  id: string,
  input: Partial<{
    username: string
    email: string
    role: 'admin' | 'user'
    locale: string
    timezone: string
    theme: string
  }>,
) {
  const self = actor.id === id
  if (!self && actor.role !== 'admin') throw notFound()
  if ((input.username !== undefined || input.email !== undefined || input.role) && actor.role !== 'admin') throw notFound()
  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!existing) throw notFound()
  if (actor.role === 'admin' && input.role === 'user' && existing.role === 'admin') {
    await assertKeepsOrgAdmin(db, id)
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (self || actor.role === 'admin') {
    if (input.locale) patch.locale = input.locale
    if (input.timezone) patch.timezone = input.timezone
    if (input.theme) patch.theme = input.theme
  }
  if (actor.role === 'admin') {
    if (input.role) patch.role = input.role
    if (input.username) {
      assertUsername(input.username)
      patch.username = input.username.toLowerCase()
    }
    if (input.email) patch.email = input.email.toLowerCase()
  }
  let user: typeof existing
  try {
    const [updated] = await db.update(users).set(patch).where(eq(users.id, id)).returning()
    if (!updated) throw notFound()
    user = updated
  } catch (error) {
    if (error instanceof Error && 'status' in error) throw error
    uniqueIdentityConflict(error)
  }
  const usernameChanged = Boolean(input.username && input.username.toLowerCase() !== existing.username)
  const emailChanged = Boolean(input.email && input.email.toLowerCase() !== existing.email)
  const roleChanged = Boolean(input.role && input.role !== existing.role)
  if (usernameChanged || emailChanged || roleChanged) {
    await writeAudit(db, actor, {
      action: 'user.update',
      resourceType: 'user',
      resourceId: id,
      metadata: {
        ...(usernameChanged ? { username: user.username } : {}),
        ...(emailChanged ? { email: user.email } : {}),
        ...(roleChanged ? { role: user.role } : {}),
      },
    })
  }
  return publicUser(user)
}

export async function setDisabled(db: AppDatabase, actor: Subject, id: string, disabled: boolean) {
  if (actor.role !== 'admin') throw notFound()
  if (disabled) await assertKeepsOrgAdmin(db, id)
  const [user] = await db
    .update(users)
    .set({ disabledAt: disabled ? new Date() : null, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning()
  if (!user) throw notFound()
  await writeAudit(db, actor, { action: disabled ? 'user.disable' : 'user.enable', resourceType: 'user', resourceId: id })
  return publicUser(user)
}

export async function resetPassword(db: AppDatabase, env: Env, actor: Subject, id: string, password: string) {
  if (actor.role !== 'admin') throw notFound()
  const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  if (!existing) throw notFound()
  assertPassword(password, existing.username)
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password, env), mustChangePassword: true, updatedAt: new Date() })
    .where(eq(users.id, id))
  await writeAudit(db, actor, { action: 'user.password.reset', resourceType: 'user', resourceId: id })
}

export async function setSystemGrants(
  db: AppDatabase,
  actor: Subject,
  id: string,
  grants: { action: Action; effect: 'allow' | 'deny' }[],
) {
  if (actor.role !== 'admin') throw notFound()
  await replaceGrants(db, { kind: 'user', id }, 'system', null, grants)
  await writeAudit(db, actor, { action: 'permission.change', resourceType: 'user', resourceId: id, metadata: { grants } })
}

export async function removeUser(db: AppDatabase, actor: Subject, id: string) {
  if (actor.role !== 'admin') throw notFound()
  if (actor.id === id) throw badRequest('You cannot delete your own account')
  await assertKeepsOrgAdmin(db, id)
  await db
    .delete(permissionGrants)
    .where(and(eq(permissionGrants.subjectType, 'user'), eq(permissionGrants.subjectId, id)))
  invalidateGrantsCache({ kind: 'user', id })
  const [user] = await db.delete(users).where(eq(users.id, id)).returning()
  if (!user) throw notFound()
  await writeAudit(db, actor, { action: 'user.delete', resourceType: 'user', resourceId: id })
}
