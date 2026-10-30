import { eq } from 'drizzle-orm'
import type { Action } from '@datavalley/shared'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { users } from '../../database/schema.js'
import { badRequest, notFound } from '../../errors.js'
import { replaceGrants } from '../../security/access.js'
import { writeAudit } from '../../security/audit.js'
import { assertPassword, hashPassword } from '../../security/passwords.js'
import type { Subject } from '../../security/subject.js'
import { publicUser } from '../auth/service.js'

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
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(input.username)) throw badRequest('Username must be 3-32 characters')
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
  input: Partial<{ role: 'admin' | 'user'; locale: string; timezone: string; theme: string }>,
) {
  const self = actor.id === id
  if (!self && actor.role !== 'admin') throw notFound()
  if (!self && (input.locale || input.timezone || input.theme) && actor.role !== 'admin') throw notFound()
  if ((input.role && !self) || (input.role && actor.role === 'admin')) {
    // admins may change roles, including their own
  } else if (input.role) throw notFound()
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (self || actor.role === 'admin') {
    if (input.locale) patch.locale = input.locale
    if (input.timezone) patch.timezone = input.timezone
    if (input.theme) patch.theme = input.theme
  }
  if (actor.role === 'admin' && input.role) patch.role = input.role
  const [user] = await db.update(users).set(patch).where(eq(users.id, id)).returning()
  if (!user) throw notFound()
  return publicUser(user)
}

export async function setDisabled(db: AppDatabase, actor: Subject, id: string, disabled: boolean) {
  if (actor.role !== 'admin') throw notFound()
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
  const [user] = await db.delete(users).where(eq(users.id, id)).returning()
  if (!user) throw notFound()
  await writeAudit(db, actor, { action: 'user.delete', resourceType: 'user', resourceId: id })
}
