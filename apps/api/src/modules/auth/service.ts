import { and, eq, gt, or } from 'drizzle-orm'
import * as OTPAuth from 'otpauth'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { loginAttempts, sessions, userTotp, users } from '../../database/schema.js'
import { AppError, unauthorized } from '../../errors.js'
import { writeAudit } from '../../security/audit.js'
import { decryptString } from '../../security/crypto.js'
import { sha256, randomToken } from '../../security/crypto.js'
import { assertPassword, hashPassword, verifyPassword } from '../../security/passwords.js'
import type { Subject } from '../../security/subject.js'

const IDLE_MS = 24 * 60 * 60 * 1000
const ABSOLUTE_MS = 14 * 24 * 60 * 60 * 1000

export function publicUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    disabled: Boolean(user.disabledAt),
    mustChangePassword: user.mustChangePassword,
    locale: user.locale,
    timezone: user.timezone,
    theme: user.theme,
    createdAt: user.createdAt.toISOString(),
  }
}

export async function findUserByLogin(db: AppDatabase, login: string) {
  const key = login.trim().toLowerCase()
  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.username, key), eq(users.email, key)))
    .limit(1)
  return user ?? null
}

async function failureCount(db: AppDatabase, username: string) {
  const since = new Date(Date.now() - 15 * 60 * 1000)
  const rows = await db
    .select({ id: loginAttempts.id })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.username, username), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since)))
  return rows.length
}

export async function login(
  db: AppDatabase,
  env: Env,
  input: { login: string; password: string; totpCode?: string },
  meta: { ip?: string; userAgent?: string },
) {
  const key = input.login.trim().toLowerCase()
  if ((await failureCount(db, key)) >= 10) {
    await writeAudit(db, null, {
      action: 'auth.login.failure',
      resourceType: 'user',
      metadata: { username: key, reason: 'locked' },
      ip: meta.ip,
    })
    throw new AppError(429, 'locked', 'Account is temporarily locked')
  }
  const user = await findUserByLogin(db, key)
  const valid = Boolean(user && !user.disabledAt && (await verifyPassword(user.passwordHash, input.password)))
  if (!user || !valid) {
    await db.insert(loginAttempts).values({ username: key, ip: meta.ip, success: false })
    await writeAudit(db, null, {
      action: 'auth.login.failure',
      resourceType: 'user',
      metadata: { username: key },
      ip: meta.ip,
    })
    throw unauthorized('Invalid username or password')
  }
  const [totp] = await db.select().from(userTotp).where(eq(userTotp.userId, user.id)).limit(1)
  if (totp?.enabled) {
    if (!input.totpCode) throw new AppError(401, 'totp_required', 'Two-factor code required')
    const secret = decryptString(env.CREDENTIALS_KEY, totp.secretEncrypted)
    const generator = new OTPAuth.TOTP({
      issuer: 'Datavalley',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    })
    const delta = generator.validate({ token: input.totpCode, window: 1 })
    if (delta === null) throw unauthorized('Invalid two-factor code')
  }
  await db.insert(loginAttempts).values({ username: key, ip: meta.ip, success: true })
  const token = randomToken()
  const now = new Date()
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: sha256(token),
    userAgent: meta.userAgent,
    ip: meta.ip,
    lastSeenAt: now,
    idleExpiresAt: new Date(now.getTime() + IDLE_MS),
    absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_MS),
  })
  await writeAudit(db, { id: user.id, kind: 'user', source: 'web' }, {
    action: 'auth.login.success',
    resourceType: 'user',
    resourceId: user.id,
    ip: meta.ip,
  })
  return { token, user }
}

export async function subjectFromSession(db: AppDatabase, token: string): Promise<Subject | null> {
  const [session] = await db.select().from(sessions).where(eq(sessions.tokenHash, sha256(token))).limit(1)
  if (!session || session.revokedAt) return null
  const now = new Date()
  if (session.idleExpiresAt < now || session.absoluteExpiresAt < now) return null
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1)
  if (!user || user.disabledAt) return null
  if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, idleExpiresAt: new Date(now.getTime() + IDLE_MS) })
      .where(eq(sessions.id, session.id))
  }
  return { kind: 'user', id: user.id, role: user.role === 'admin' ? 'admin' : 'user', source: 'web', user }
}

export async function logout(db: AppDatabase, token: string) {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, sha256(token)))
}

export async function changePassword(
  db: AppDatabase,
  env: Env,
  subject: Subject,
  input: { currentPassword: string; newPassword: string },
) {
  if (!subject.user) throw unauthorized()
  assertPassword(input.newPassword, subject.user.username)
  if (!(await verifyPassword(subject.user.passwordHash, input.currentPassword))) {
    throw unauthorized('Current password is incorrect')
  }
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(input.newPassword, env),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, subject.user.id))
  await writeAudit(db, subject, { action: 'auth.password.change', resourceType: 'user', resourceId: subject.id })
}

export async function listSessions(db: AppDatabase, userId: string) {
  const rows = await db.select().from(sessions).where(eq(sessions.userId, userId))
  return rows
    .filter((session) => !session.revokedAt)
    .map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ip: session.ip,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
    }))
}

export async function revokeSession(db: AppDatabase, userId: string, sessionId: string) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
}
