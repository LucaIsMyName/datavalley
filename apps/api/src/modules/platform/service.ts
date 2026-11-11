import { createHmac, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { and, desc, eq, gte, inArray, lt, lte, or, sql } from 'drizzle-orm'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import * as OTPAuth from 'otpauth'
import { escapeLike, type Action } from '@datavalley/shared'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import {
  apiKeys,
  auditLogs,
  backgroundJobs,
  integrationSyncJobs,
  mediaFiles,
  projects,
  tables,
  notifications,
  pluginConfigurations,
  pluginConnections,
  permissionGrants,
  pluginPermissions,
  plugins,
  recoveryCodes,
  serviceAccounts,
  tableViews,
  userTotp,
} from '../../database/schema.js'
import { AppError, badRequest, notFound, unauthorized } from '../../errors.js'
import { assertCan, replaceGrants } from '../../security/access.js'
import { invalidateGrantsCache } from '../../security/grants-cache.js'
import { allowedMediaMime, sniffMediaMime } from '../../security/media-mime.js'
import type { RateLimiter } from '../../security/rate-limit.js'
import { writeAudit } from '../../security/audit.js'
import { decryptString, encryptString, randomToken, safeEqual, sha256 } from '../../security/crypto.js'
import type { Subject } from '../../security/subject.js'
import { assertMediaReadable, loadMediaFile } from './media-access.js'
import { findMediaUsages, usageCountFor } from './media-usages.js'
import { requireEditableTable, requireTable } from '../tables/service.js'

export async function subjectFromApiKey(
  db: AppDatabase,
  rateLimiter: RateLimiter,
  token: string,
  ip?: string,
): Promise<Subject | null> {
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.tokenHash, sha256(token))).limit(1)
  if (!key || key.revokedAt) return null
  if (key.ipAllowlist.length && ip && !key.ipAllowlist.includes(ip)) return null
  if (!(await rateLimiter.consume(`api_key:${key.id}`, key.rateLimitPerMinute))) {
    throw new AppError(429, 'rate_limited', 'API key rate limit exceeded')
  }
  // Minute precision is enough for "last used" and keeps busy keys from writing the same row on every request.
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() >= 60_000) {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id))
  }
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

export async function deleteApiKey(db: AppDatabase, actor: Subject, id: string) {
  if (actor.role !== 'admin') throw new AppError(403, 'forbidden', 'Admin access is required')
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1)
  if (!key) throw notFound()
  await db
    .delete(permissionGrants)
    .where(and(eq(permissionGrants.subjectType, 'api_key'), eq(permissionGrants.subjectId, id)))
  await db.delete(apiKeys).where(eq(apiKeys.id, id))
  await db.delete(serviceAccounts).where(eq(serviceAccounts.id, key.serviceAccountId))
  invalidateGrantsCache({ kind: 'api_key', id })
  await writeAudit(db, actor, { action: 'api_key.delete', resourceType: 'api_key', resourceId: id })
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

async function ownedView(db: AppDatabase, subject: Subject, tableId: string, viewId: string) {
  await requireTable(db, subject, tableId, 'view')
  const [view] = await db
    .select()
    .from(tableViews)
    .where(and(eq(tableViews.id, viewId), eq(tableViews.tableId, tableId)))
  if (!view) throw notFound()
  if (view.ownerId !== subject.id && subject.role !== 'admin') throw new AppError(403, 'forbidden', 'You cannot change this view')
  return view
}

export async function renameView(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  viewId: string,
  name: string,
) {
  const trimmed = name.trim()
  if (!trimmed) throw badRequest('View name is required')
  await ownedView(db, subject, tableId, viewId)
  const [view] = await db.update(tableViews).set({ name: trimmed }).where(eq(tableViews.id, viewId)).returning()
  return { id: view.id, name: view.name, shared: view.shared, definition: view.definition }
}

export async function deleteView(db: AppDatabase, subject: Subject, tableId: string, viewId: string) {
  await ownedView(db, subject, tableId, viewId)
  await db.delete(tableViews).where(eq(tableViews.id, viewId))
  return { ok: true }
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

/** Google Sheets can be connected, but row import is not implemented, so it stays out of the product UI. */
const HIDDEN_PLUGINS = new Set(['google-sheets'])

export async function listPlugins(db: AppDatabase) {
  const rows = await db.select().from(plugins)
  return Promise.all(
    rows
      .filter((plugin) => !HIDDEN_PLUGINS.has(plugin.id))
      .map(async (plugin) => {
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

export const WEBHOOK_TOLERANCE_SECONDS = 300

/**
 * Checks an incoming webhook. The signature is the hex HMAC-SHA256 of `${timestamp}.${body}`, and the
 * timestamp (Unix seconds) must be within five minutes of now, so a captured delivery cannot be replayed later.
 */
export function verifyWebhook(
  secret: string,
  body: string,
  signature: string | undefined,
  timestamp: string | undefined,
  now = Date.now(),
) {
  if (!signature || !timestamp || !/^\d{1,12}$/.test(timestamp)) return false
  if (Math.abs(now / 1000 - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return false
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
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

type UploadLabels = { projectNames: Map<string, string>; tableNames: Map<string, string> }

async function loadUploadLabels(db: AppDatabase, files: (typeof mediaFiles.$inferSelect)[]): Promise<UploadLabels> {
  const projectIds = [...new Set(files.map((file) => file.projectId).filter((id): id is string => Boolean(id)))]
  const tableIds = [...new Set(files.map((file) => file.tableId).filter((id): id is string => Boolean(id)))]
  const projectNames = new Map<string, string>()
  const tableNames = new Map<string, string>()
  if (projectIds.length) {
    const rows = await db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, projectIds))
    for (const row of rows) projectNames.set(row.id, row.name)
  }
  if (tableIds.length) {
    const rows = await db.select({ id: tables.id, name: tables.name }).from(tables).where(inArray(tables.id, tableIds))
    for (const row of rows) tableNames.set(row.id, row.name)
  }
  return { projectNames, tableNames }
}

function presentMediaFile(file: typeof mediaFiles.$inferSelect, labels?: UploadLabels, usageCount?: number) {
  return {
    id: file.id,
    name: file.originalName,
    mime: file.mime,
    size: file.sizeBytes,
    createdAt: file.createdAt.toISOString(),
    tableId: file.tableId,
    projectId: file.projectId,
    uploadProjectName: file.projectId ? (labels?.projectNames.get(file.projectId) ?? null) : null,
    uploadTableName: file.tableId ? (labels?.tableNames.get(file.tableId) ?? null) : null,
    usageCount,
  }
}

export async function storeMedia(
  db: AppDatabase,
  env: Env,
  actor: Subject,
  scope: { tableId?: string | null },
  file: { filename: string; mimetype: string; buffer: Buffer },
) {
  if (!actor.user) throw unauthorized()
  let organizationId = actor.user.organizationId
  let projectId: string | null = null
  let tableId: string | null = null
  if (scope.tableId) {
    const table = await requireEditableTable(db, actor, scope.tableId, 'edit')
    tableId = table.id
    projectId = table.projectId
    const [projectRow] = await db
      .select({ organizationId: projects.organizationId })
      .from(projects)
      .where(eq(projects.id, table.projectId))
      .limit(1)
    if (projectRow) organizationId = projectRow.organizationId
  }
  if (!allowedMediaMime(file.mimetype)) throw new AppError(400, 'unsupported_media', 'File type is not allowed')
  const mime = sniffMediaMime(file.buffer, file.mimetype)
  if (!mime) throw new AppError(400, 'unsupported_media', 'File content does not match its type')
  if (file.buffer.length > env.MEDIA_MAX_BYTES) throw new AppError(400, 'payload_too_large', 'File is too large')
  const storageKey = randomBytes(16).toString('hex')
  await createMediaStorage(env).put(storageKey, file.buffer, mime)
  const [saved] = await db
    .insert(mediaFiles)
    .values({
      storageKey,
      originalName: file.filename,
      mime,
      sizeBytes: file.buffer.length,
      organizationId,
      projectId,
      tableId,
      createdBy: actor.user.id,
    })
    .returning()
  return presentMediaFile(saved)
}

export async function readMedia(db: AppDatabase, env: Env, actor: Subject, id: string) {
  const [file] = await db.select().from(mediaFiles).where(eq(mediaFiles.id, id)).limit(1)
  if (!file) throw notFound()
  await assertMediaReadable(db, actor, file)
  const body = await createMediaStorage(env).get(file.storageKey)
  return { file, body }
}

async function readableMediaIds(db: AppDatabase, actor: Subject, files: (typeof mediaFiles.$inferSelect)[]) {
  const readable = new Set<string>()
  if (!actor.user) return readable
  const tableIds = [...new Set(files.flatMap((file) => (file.tableId ? [file.tableId] : [])))]
  const allowedTables = new Set<string>()
  for (const tableId of tableIds) {
    try {
      await requireTable(db, actor, tableId, 'view')
      allowedTables.add(tableId)
    } catch {
      // A file on a table this person cannot view stays out of the page.
    }
  }
  for (const file of files) {
    if (file.organizationId !== actor.user.organizationId) continue
    if (file.tableId) {
      if (allowedTables.has(file.tableId)) readable.add(file.id)
      continue
    }
    if (actor.role === 'admin' || file.createdBy === actor.id) readable.add(file.id)
  }
  return readable
}

export async function listMedia(
  db: AppDatabase,
  actor: Subject,
  input: { limit?: number; cursor?: string | null; q?: string | null; mime?: string | null },
) {
  if (!actor.user) throw unauthorized()
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
  const organizationId = actor.user.organizationId
  const needle = input.q?.trim()
  const filters = [eq(mediaFiles.organizationId, organizationId)]
  if (needle) filters.push(sql`${mediaFiles.originalName} ILIKE ${`%${escapeLike(needle)}%`} ESCAPE '\\'`)
  if (input.mime === 'image') filters.push(sql`${mediaFiles.mime} ILIKE 'image/%'`)
  if (input.mime === 'pdf') filters.push(eq(mediaFiles.mime, 'application/pdf'))
  let cursor = input.cursor ?? null
  const matched: (typeof mediaFiles.$inferSelect)[] = []
  let exhausted = false
  while (matched.length <= limit && !exhausted) {
    const pageFilters = [...filters]
    if (cursor) {
      const [mark] = await db
        .select({ id: mediaFiles.id, createdAt: mediaFiles.createdAt })
        .from(mediaFiles)
        .where(and(eq(mediaFiles.id, cursor), eq(mediaFiles.organizationId, organizationId)))
        .limit(1)
      if (mark) {
        const older = or(
          lt(mediaFiles.createdAt, mark.createdAt),
          and(eq(mediaFiles.createdAt, mark.createdAt), lt(mediaFiles.id, mark.id)),
        )
        if (older) pageFilters.push(older)
      }
    }
    const batch = await db
      .select()
      .from(mediaFiles)
      .where(and(...pageFilters))
      .orderBy(desc(mediaFiles.createdAt), desc(mediaFiles.id))
      .limit(100)
    if (batch.length === 0) {
      exhausted = true
      break
    }
    const allowed = await readableMediaIds(db, actor, batch)
    for (const file of batch) {
      if (!allowed.has(file.id)) continue
      matched.push(file)
      if (matched.length > limit) break
    }
    cursor = batch[batch.length - 1]?.id ?? null
    if (batch.length < 100) exhausted = true
  }
  const page = matched.slice(0, limit)
  const nextCursor = matched.length > limit ? (page.at(-1)?.id ?? null) : null
  const labels = await loadUploadLabels(db, page)
  const usageMap = await findMediaUsages(
    db,
    actor,
    page.map((file) => file.id),
  )
  return {
    files: page.map((file) => presentMediaFile(file, labels, usageCountFor(usageMap, file.id))),
    nextCursor,
  }
}

export async function getMediaDetails(db: AppDatabase, actor: Subject, id: string) {
  const file = await loadMediaFile(db, id)
  if (!file) throw notFound()
  await assertMediaReadable(db, actor, file)
  const labels = await loadUploadLabels(db, [file])
  const usageMap = await findMediaUsages(db, actor, [id])
  const usages = usageMap.get(id) ?? []
  return { file: presentMediaFile(file, labels, usages.length), usages }
}

export async function notify(db: AppDatabase, userId: string, input: { type: string; title: string; body?: string; metadata?: Record<string, unknown> }) {
  await db.insert(notifications).values({ userId, type: input.type, title: input.title, body: input.body ?? '', metadata: input.metadata ?? {} })
}

function noticeHref(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') return null
  const href = (metadata as { href?: unknown }).href
  if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) return null
  return href
}

export async function listNotifications(db: AppDatabase, userId: string) {
  const rows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(50)
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: noticeHref(row.metadata),
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }))
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
  const claimed = await db.transaction(async (tx) => {
    const [job] = await tx.select().from(backgroundJobs).where(eq(backgroundJobs.id, jobId)).for('update').limit(1)
    if (!job) return null
    if (job.status === 'completed' || (job.status === 'running' && job.result != null)) {
      if (job.status !== 'completed') {
        await tx.update(backgroundJobs).set({ status: 'completed', updatedAt: new Date() }).where(eq(backgroundJobs.id, jobId))
      }
      return { kind: 'done' as const, result: job.result }
    }
    if (job.status === 'failed') return { kind: 'failed' as const, error: job.error ?? 'Job failed' }
    if (job.status === 'running') return { kind: 'busy' as const }
    const attempts = job.attempts + 1
    await tx
      .update(backgroundJobs)
      .set({ status: 'running', attempts, updatedAt: new Date() })
      .where(eq(backgroundJobs.id, jobId))
    return { kind: 'claimed' as const, payload: job.payload, attempts, maxAttempts: job.maxAttempts }
  })
  if (!claimed) throw notFound()
  if (claimed.kind === 'done') return { status: 'completed' as const, result: claimed.result }
  if (claimed.kind === 'failed') return { status: 'failed' as const, error: claimed.error }
  if (claimed.kind === 'busy') return { status: 'completed' as const, result: null }
  try {
    const result = await handler(claimed.payload, claimed.attempts)
    await db
      .update(backgroundJobs)
      .set({ result: result as never, updatedAt: new Date() })
      .where(eq(backgroundJobs.id, jobId))
    await db
      .update(backgroundJobs)
      .set({ status: 'completed', attempts: claimed.attempts, updatedAt: new Date() })
      .where(eq(backgroundJobs.id, jobId))
    return { status: 'completed' as const, result }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Job failed'
    if (claimed.attempts < claimed.maxAttempts) {
      await db
        .update(backgroundJobs)
        .set({ status: 'retry', attempts: claimed.attempts, error: message, updatedAt: new Date() })
        .where(eq(backgroundJobs.id, jobId))
      throw error
    }
    await db
      .update(backgroundJobs)
      .set({ status: 'failed', attempts: claimed.attempts, error: message, updatedAt: new Date() })
      .where(eq(backgroundJobs.id, jobId))
    return { status: 'failed' as const, error: message }
  }
}
