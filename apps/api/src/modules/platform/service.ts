import { createHmac, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import * as OTPAuth from 'otpauth'
import type { Action } from '@datavalley/shared'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import {
  apiKeys,
  auditLogs,
  backgroundJobs,
  integrationSyncJobs,
  mediaFiles,
  notifications,
  pluginConfigurations,
  pluginConnections,
  pluginPermissions,
  plugins,
  recoveryCodes,
  serviceAccounts,
  tableViews,
  userTotp,
} from '../../database/schema.js'
import { AppError, badRequest, notFound, unauthorized } from '../../errors.js'
import { assertCan, replaceGrants } from '../../security/access.js'
import { writeAudit } from '../../security/audit.js'
import { decryptString, encryptString, randomToken, safeEqual, sha256 } from '../../security/crypto.js'
import type { Subject } from '../../security/subject.js'
import { requireTable } from '../tables/service.js'

const hits = new Map<string, number[]>()

export function consumeRateLimit(id: string, max: number) {
  const now = Date.now()
  const recent = (hits.get(id) ?? []).filter((time) => now - time < 60_000)
  if (recent.length >= max) return false
  recent.push(now)
  hits.set(id, recent)
  return true
}

export async function subjectFromApiKey(db: AppDatabase, token: string, ip?: string): Promise<Subject | null> {
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.tokenHash, sha256(token))).limit(1)
  if (!key || key.revokedAt) return null
  if (key.ipAllowlist.length && ip && !key.ipAllowlist.includes(ip)) return null
  if (!consumeRateLimit(key.id, key.rateLimitPerMinute)) throw new AppError(429, 'rate_limited', 'API key rate limit exceeded')
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id))
  return { kind: 'api_key', id: key.id, role: 'service', source: 'api_key', user: null, apiKeyId: key.id }
}

function presentKey(key: typeof apiKeys.$inferSelect) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    ipAllowlist: key.ipAllowlist,
    rateLimitPerMinute: key.rateLimitPerMinute,
    createdAt: key.createdAt.toISOString(),
    revokedAt: key.revokedAt?.toISOString() ?? null,
  }
}

export async function createApiKey(
  db: AppDatabase,
  actor: Subject,
  input: { name: string; scopes: { action: Action; resourceType: 'project' | 'table' | 'system'; resourceId?: string | null }[]; ipAllowlist?: string[]; rateLimitPerMinute?: number },
) {
  if (actor.role !== 'admin') throw new AppError(403, 'forbidden', 'Admin access is required')
  const secret = `dv_live_${randomToken(32)}`
  const prefix = secret.slice(0, 16)
  const [account] = await db.insert(serviceAccounts).values({ name: input.name }).returning()
  const [key] = await db
    .insert(apiKeys)
    .values({
      serviceAccountId: account.id,
      name: input.name,
      prefix,
      tokenHash: sha256(secret),
      ipAllowlist: input.ipAllowlist ?? [],
      rateLimitPerMinute: input.rateLimitPerMinute ?? 60,
      createdBy: actor.id,
    })
    .returning()
  for (const scope of input.scopes) {
    await replaceGrants(db, { kind: 'api_key', id: key.id }, scope.resourceType, scope.resourceId ?? null, [{ action: scope.action, effect: 'allow' }])
  }
  await writeAudit(db, actor, { action: 'api_key.create', resourceType: 'api_key', resourceId: key.id })
  return { ...presentKey(key), key: secret }
}

export async function listApiKeys(db: AppDatabase, actor: Subject) {
  if (actor.role !== 'admin') throw new AppError(403, 'forbidden', 'Admin access is required')
  const rows = await db.select().from(apiKeys)
  return rows.map(presentKey)
}

export async function revokeApiKey(db: AppDatabase, actor: Subject, id: string) {
  if (actor.role !== 'admin') throw new AppError(403, 'forbidden', 'Admin access is required')
  const [key] = await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id)).returning()
  if (!key) throw notFound()
  await writeAudit(db, actor, { action: 'api_key.revoke', resourceType: 'api_key', resourceId: id })
}

export async function rotateApiKey(db: AppDatabase, actor: Subject, id: string) {
  if (actor.role !== 'admin') throw new AppError(403, 'forbidden', 'Admin access is required')
  const secret = `dv_live_${randomToken(32)}`
  const [key] = await db
    .update(apiKeys)
    .set({ tokenHash: sha256(secret), prefix: secret.slice(0, 16), revokedAt: null })
    .where(eq(apiKeys.id, id))
    .returning()
  if (!key) throw notFound()
  await writeAudit(db, actor, { action: 'api_key.rotate', resourceType: 'api_key', resourceId: id })
  return { ...presentKey(key), key: secret }
}

export async function listViews(db: AppDatabase, subject: Subject, tableId: string) {
  await requireTable(db, subject, tableId, 'view')
  const rows = await db.select().from(tableViews).where(eq(tableViews.tableId, tableId))
  return rows
    .filter((view) => view.shared || view.ownerId === subject.id)
    .map((view) => ({ id: view.id, name: view.name, shared: view.shared, ownerId: view.ownerId, definition: view.definition }))
}

export async function saveView(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  input: { name: string; shared?: boolean; definition: unknown },
) {
  const table = await requireTable(db, subject, tableId, 'view')
  if (input.shared) await assertCan(db, subject, 'share', { type: 'project', id: table.projectId })
  const [view] = await db
    .insert(tableViews)
    .values({ tableId, name: input.name, shared: Boolean(input.shared), ownerId: subject.id, definition: input.definition as never })
    .returning()
  return { id: view.id, name: view.name, shared: view.shared, definition: view.definition }
}

export async function ensurePlugins(db: AppDatabase) {
  await db
    .insert(plugins)
    .values([
      { id: 'csv', name: 'CSV', version: '1.0.0', kind: 'builtin', enabled: true },
      { id: 'google-sheets', name: 'Google Sheets', version: '1.0.0', kind: 'builtin', enabled: false },
    ])
    .onConflictDoNothing()
  const scopes = [
    ['csv', 'rows:read'],
    ['csv', 'rows:write'],
    ['google-sheets', 'rows:read'],
    ['google-sheets', 'rows:write'],
    ['google-sheets', 'sync:run'],
  ] as const
  for (const [pluginId, scope] of scopes) {
    await db.insert(pluginPermissions).values({ pluginId, scope }).onConflictDoNothing()
  }
}

export async function listPlugins(db: AppDatabase) {
  const rows = await db.select().from(plugins)
  return Promise.all(
    rows.map(async (plugin) => {
      const [config] = await db.select().from(pluginConfigurations).where(eq(pluginConfigurations.pluginId, plugin.id))
      const scopes = await db.select().from(pluginPermissions).where(eq(pluginPermissions.pluginId, plugin.id))
      return {
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        enabled: plugin.enabled,
        scopes: scopes.map((scope) => scope.scope),
        config: config?.config ?? {},
      }
    }),
  )
}

export async function setPluginEnabled(db: AppDatabase, actor: Subject, id: string, enabled: boolean) {
  if (actor.role !== 'admin') throw new AppError(403, 'forbidden', 'Admin access is required')
  const [plugin] = await db.update(plugins).set({ enabled }).where(eq(plugins.id, id)).returning()
  if (!plugin) throw notFound()
  await writeAudit(db, actor, { action: enabled ? 'plugin.enable' : 'plugin.disable', resourceType: 'plugin', resourceId: id })
  return plugin
}

export async function configurePlugin(db: AppDatabase, actor: Subject, id: string, config: Record<string, unknown>) {
  if (actor.role !== 'admin') throw new AppError(403, 'forbidden', 'Admin access is required')
  await db
    .insert(pluginConfigurations)
    .values({ pluginId: id, config })
    .onConflictDoUpdate({ target: pluginConfigurations.pluginId, set: { config, updatedAt: new Date() } })
  return { ok: true }
}

export async function requirePlugin(db: AppDatabase, id: string, scope: string) {
  const [plugin] = await db.select().from(plugins).where(eq(plugins.id, id)).limit(1)
  if (!plugin || !plugin.enabled) throw new AppError(403, 'plugin_disabled', 'Plugin is disabled')
  const scopes = await db.select().from(pluginPermissions).where(eq(pluginPermissions.pluginId, id))
  if (!scopes.some((item) => item.scope === scope)) {
    throw new AppError(403, 'plugin_disabled', `Plugin is missing the ${scope} scope`)
  }
  return plugin
}

export function googleAuthUrl(env: Env, state: string) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new AppError(400, 'configuration_missing', 'Google OAuth is not configured')
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID)
  url.searchParams.set('redirect_uri', env.GOOGLE_REDIRECT_URI)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/spreadsheets')
  url.searchParams.set('state', state)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  return url.toString()
}

export function signState(env: Env, payload: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 10 * 60 * 1000 })).toString('base64url')
  const mac = createHmac('sha256', env.CREDENTIALS_KEY).update(body).digest('base64url')
  return `${body}.${mac}`
}

export function readState(env: Env, state: string) {
  const [body, mac] = state.split('.')
  if (!body || !mac) throw unauthorized('Invalid OAuth state')
  const expected = createHmac('sha256', env.CREDENTIALS_KEY).update(body).digest('base64url')
  if (!safeEqual(mac, expected)) throw unauthorized('Invalid OAuth state')
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { exp: number; projectId: string; userId: string }
  if (payload.exp < Date.now()) throw unauthorized('OAuth state expired')
  return payload
}

export async function saveGoogleConnection(db: AppDatabase, env: Env, projectId: string, tokens: unknown) {
  const [connection] = await db
    .insert(pluginConnections)
    .values({
      pluginId: 'google-sheets',
      projectId,
      name: 'Google Sheets',
      credentialsEncrypted: encryptString(env.CREDENTIALS_KEY, JSON.stringify(tokens)),
      config: {},
    })
    .returning()
  return { id: connection.id, name: connection.name, projectId }
}

export async function publicConnections(db: AppDatabase, projectId: string) {
  const rows = await db.select().from(pluginConnections).where(eq(pluginConnections.projectId, projectId))
  return rows.map((row) => ({
    id: row.id,
    pluginId: row.pluginId,
    name: row.name,
    config: row.config,
    hasCredentials: Boolean(row.credentialsEncrypted),
  }))
}

export function verifyWebhook(secret: string, body: string, signature: string | undefined) {
  if (!signature) return false
  const mac = createHmac('sha256', secret).update(body).digest('hex')
  return safeEqual(mac, signature)
}

export async function recordSync(db: AppDatabase, connectionId: string, status: string, error?: string, stats: Record<string, unknown> = {}) {
  const [job] = await db
    .insert(integrationSyncJobs)
    .values({ connectionId, status, error, stats, finishedAt: status === 'running' ? null : new Date() })
    .returning()
  return job
}

export async function listSyncJobs(db: AppDatabase, connectionId: string) {
  const rows = await db.select().from(integrationSyncJobs).where(eq(integrationSyncJobs.connectionId, connectionId)).orderBy(desc(integrationSyncJobs.createdAt))
  return rows.map((job) => ({ id: job.id, status: job.status, error: job.error, stats: job.stats, createdAt: job.createdAt.toISOString() }))
}

export async function connectionSecret(db: AppDatabase, env: Env, connectionId: string) {
  const [connection] = await db.select().from(pluginConnections).where(eq(pluginConnections.id, connectionId)).limit(1)
  if (!connection?.credentialsEncrypted) return null
  return decryptString(env.CREDENTIALS_KEY, connection.credentialsEncrypted)
}

const allowedMime = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/csv'])

export interface MediaStorage {
  put(key: string, body: Buffer, mime: string): Promise<void>
  get(key: string): Promise<Buffer>
}

export function createMediaStorage(env: Env): MediaStorage {
  if (env.S3_ENDPOINT && env.S3_BUCKET) {
    const client = new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
      forcePathStyle: true,
    })
    return {
      async put(key, body, mime) {
        await client.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: mime }))
      },
      async get(key) {
        const response = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }))
        const bytes = await response.Body?.transformToByteArray()
        return Buffer.from(bytes ?? [])
      },
    }
  }
  return {
    async put(key, body) {
      const path = join(env.MEDIA_ROOT, key)
      await mkdir(env.MEDIA_ROOT, { recursive: true })
      await writeFile(path, body)
    },
    async get(key) {
      return readFile(join(env.MEDIA_ROOT, key))
    },
  }
}

void DeleteObjectCommand

export async function storeMedia(db: AppDatabase, env: Env, actor: Subject, file: { filename: string; mimetype: string; buffer: Buffer }) {
  if (!allowedMime.has(file.mimetype)) throw new AppError(400, 'unsupported_media', 'File type is not allowed')
  if (file.buffer.length > env.MEDIA_MAX_BYTES) throw new AppError(400, 'payload_too_large', 'File is too large')
  const storageKey = randomBytes(16).toString('hex')
  await createMediaStorage(env).put(storageKey, file.buffer, file.mimetype)
  const [saved] = await db
    .insert(mediaFiles)
    .values({ storageKey, originalName: file.filename, mime: file.mimetype, sizeBytes: file.buffer.length, createdBy: actor.id })
    .returning()
  return { id: saved.id, name: saved.originalName, mime: saved.mime, size: saved.sizeBytes }
}

export async function readMedia(db: AppDatabase, env: Env, id: string) {
  const [file] = await db.select().from(mediaFiles).where(eq(mediaFiles.id, id)).limit(1)
  if (!file) throw notFound()
  const body = await createMediaStorage(env).get(file.storageKey)
  return { file, body }
}

export async function notify(db: AppDatabase, userId: string, input: { type: string; title: string; body?: string; metadata?: Record<string, unknown> }) {
  await db.insert(notifications).values({ userId, type: input.type, title: input.title, body: input.body ?? '', metadata: input.metadata ?? {} })
}

export async function listNotifications(db: AppDatabase, userId: string) {
  const rows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(50)
  return rows.map((row) => ({ id: row.id, type: row.type, title: row.title, body: row.body, readAt: row.readAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() }))
}

export async function markNotificationRead(db: AppDatabase, userId: string, id: string) {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
}

export async function listAudit(
  db: AppDatabase,
  actor: Subject,
  query: { actorId?: string; action?: string; resourceType?: string; from?: string; to?: string; cursor?: string },
) {
  if (actor.role !== 'admin') throw new AppError(403, 'forbidden', 'Admin access is required')
  const filters = []
  if (query.actorId) filters.push(eq(auditLogs.actorId, query.actorId))
  if (query.action) filters.push(eq(auditLogs.action, query.action))
  if (query.resourceType) filters.push(eq(auditLogs.resourceType, query.resourceType))
  if (query.from) filters.push(gte(auditLogs.createdAt, new Date(query.from)))
  if (query.to) filters.push(lte(auditLogs.createdAt, new Date(query.to)))
  const rows = await db
    .select()
    .from(auditLogs)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(51)
  const page = rows.slice(0, 50)
  return {
    entries: page.map((row) => ({
      id: row.id,
      actorId: row.actorId,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      metadata: row.metadata,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: rows.length > 50 ? page[page.length - 1]?.id ?? null : null,
  }
}

export async function enrollTotp(db: AppDatabase, env: Env, actor: Subject) {
  if (!actor.user) throw unauthorized()
  const secret = new OTPAuth.Secret({ size: 20 })
  await db
    .insert(userTotp)
    .values({ userId: actor.id, secretEncrypted: encryptString(env.CREDENTIALS_KEY, secret.base32), enabled: false })
    .onConflictDoUpdate({ target: userTotp.userId, set: { secretEncrypted: encryptString(env.CREDENTIALS_KEY, secret.base32), enabled: false } })
  const totp = new OTPAuth.TOTP({ issuer: 'Datavalley', label: actor.user.email, algorithm: 'SHA1', digits: 6, period: 30, secret })
  return { secret: secret.base32, url: totp.toString() }
}

export async function confirmTotp(db: AppDatabase, env: Env, actor: Subject, code: string) {
  const [row] = await db.select().from(userTotp).where(eq(userTotp.userId, actor.id)).limit(1)
  if (!row) throw badRequest('Start enrollment first')
  const secret = OTPAuth.Secret.fromBase32(decryptString(env.CREDENTIALS_KEY, row.secretEncrypted))
  const totp = new OTPAuth.TOTP({ secret, digits: 6, period: 30, algorithm: 'SHA1' })
  if (totp.validate({ token: code, window: 1 }) === null) throw unauthorized('Invalid two-factor code')
  await db.update(userTotp).set({ enabled: true }).where(eq(userTotp.userId, actor.id))
  const codes = Array.from({ length: 8 }, () => randomToken(6))
  await db.delete(recoveryCodes).where(eq(recoveryCodes.userId, actor.id))
  await db.insert(recoveryCodes).values(codes.map((value) => ({ userId: actor.id, codeHash: sha256(value) })))
  return { recoveryCodes: codes }
}

export async function disableTotp(db: AppDatabase, actor: Subject) {
  await db.delete(userTotp).where(eq(userTotp.userId, actor.id))
  await db.delete(recoveryCodes).where(eq(recoveryCodes.userId, actor.id))
}

export async function createJob(db: AppDatabase, type: string, payload: unknown, createdBy?: string) {
  const [job] = await db.insert(backgroundJobs).values({ type, status: 'queued', payload: payload as never, createdBy: createdBy ?? null }).returning()
  return job
}

export async function runJob(db: AppDatabase, jobId: string, handler: (payload: unknown, attempts: number) => Promise<unknown>) {
  const [job] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, jobId)).limit(1)
  if (!job) throw notFound()
  const attempts = job.attempts + 1
  try {
    const result = await handler(job.payload, attempts)
    await db.update(backgroundJobs).set({ status: 'completed', attempts, result: result as never, updatedAt: new Date() }).where(eq(backgroundJobs.id, jobId))
    return { status: 'completed' as const, result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Job failed'
    if (attempts < job.maxAttempts) {
      await db.update(backgroundJobs).set({ status: 'retry', attempts, error: message, updatedAt: new Date() }).where(eq(backgroundJobs.id, jobId))
      throw error
    }
    await db.update(backgroundJobs).set({ status: 'failed', attempts, error: message, updatedAt: new Date() }).where(eq(backgroundJobs.id, jobId))
    return { status: 'failed' as const, error: message }
  }
}
