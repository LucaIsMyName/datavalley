import { and, desc, eq, sql } from 'drizzle-orm'
import {
  extractJsonRecords,
  extractRecordsFromPayload,
  normalizeConnectorParseConfig,
  sampleFieldKeysFromRecords,
  suggestJsonRecordsPaths,
  type ConnectorParseConfig,
} from '@datavalley/shared'
import { isResourceIcon } from '@datavalley/shared'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import {
  connectorSyncJobs,
  dataConnectors,
  projects,
  tableConnectorBindings,
  tableColumns,
  tables,
  users,
} from '../../database/schema.js'
import { AppError } from '../../errors.js'
import { badRequest, notFound } from '../../errors.js'
import { assertCan } from '../../security/access.js'
import { writeAudit } from '../../security/audit.js'
import { decryptString, encryptString } from '../../security/crypto.js'
import type { Subject } from '../../security/subject.js'
import { createJob } from '../platform/service.js'
import { dispatchBackgroundJob } from '../../jobs/process.js'
import { enqueueBackgroundJob } from '../../jobs/queue.js'
import { defaultColumnIcon } from '../../column-types/index.js'
import { generateKeyBetween } from 'fractional-indexing'
import { loadColumns, nextTableName, nextTablePosition, presentTable } from '../tables/service.js'
import { fetchConnectorPayload, type ConnectorAuthConfig } from './fetch.js'

type ConnectorRow = typeof dataConnectors.$inferSelect

export function presentConnector(row: ConnectorRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    name: row.name,
    icon: row.icon,
    enabled: row.enabled,
    source: row.source,
    auth: { ...(row.auth as Record<string, unknown>), hasSecret: Boolean(row.authSecretEncrypted) },
    format: row.format,
    parse: row.parse,
    schedule: row.schedule,
    retention: row.retention,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    hasApiKey: Boolean(row.authSecretEncrypted),
  }
}

export function connectorApiKey(env: Env, row: ConnectorRow) {
  if (!row.authSecretEncrypted) return null
  return decryptString(env.CREDENTIALS_KEY, row.authSecretEncrypted)
}

async function actorOrganization(db: AppDatabase, subject: Subject) {
  if (subject.user) return subject.user.organizationId
  const [user] = await db.select().from(users).where(eq(users.id, subject.id)).limit(1)
  return user?.organizationId
}

async function assertConnectorManage(db: AppDatabase, subject: Subject, row: ConnectorRow) {
  if (subject.role === 'admin' && !row.projectId) return
  if (row.projectId) {
    await assertCan(db, subject, 'manage_permissions', { type: 'project', id: row.projectId })
    return
  }
  if (subject.role !== 'admin') throw new AppError(403, 'forbidden', 'Admin access is required')
}

async function assertConnectorVisible(db: AppDatabase, subject: Subject, row: ConnectorRow) {
  const orgId = await actorOrganization(db, subject)
  if (!orgId || row.organizationId !== orgId) throw notFound()
  if (!row.projectId) return
  await assertCan(db, subject, 'view', { type: 'project', id: row.projectId })
}

export async function listConnectors(db: AppDatabase, subject: Subject, projectId?: string) {
  const orgId = await actorOrganization(db, subject)
  if (!orgId) return []
  const rows = await db.select().from(dataConnectors).where(eq(dataConnectors.organizationId, orgId))
  const visible: ConnectorRow[] = []
  for (const row of rows) {
    if (projectId && row.projectId && row.projectId !== projectId) continue
    try {
      await assertConnectorVisible(db, subject, row)
      visible.push(row)
    } catch {
      // hidden
    }
  }
  return visible.map(presentConnector)
}

export async function getConnector(db: AppDatabase, subject: Subject, id: string) {
  const [row] = await db.select().from(dataConnectors).where(eq(dataConnectors.id, id)).limit(1)
  if (!row) throw notFound()
  await assertConnectorVisible(db, subject, row)
  return presentConnector(row)
}

export async function createConnector(
  db: AppDatabase,
  env: Env,
  subject: Subject,
  input: {
    name: string
    icon?: string
    projectId?: string | null
    enabled?: boolean
    source: Record<string, unknown>
    auth?: ConnectorAuthConfig
    format: string
    parse: unknown
    schedule?: Record<string, unknown>
    retention?: Record<string, unknown>
    apiKey?: string
  },
) {
  const orgId = await actorOrganization(db, subject)
  if (!orgId) throw notFound()
  if (input.projectId) {
    const [project] = await db.select().from(projects).where(eq(projects.id, input.projectId)).limit(1)
    if (!project || project.organizationId !== orgId) throw badRequest('Unknown project')
    await assertCan(db, subject, 'manage_permissions', { type: 'project', id: input.projectId })
  } else if (subject.role !== 'admin') {
    throw new AppError(403, 'forbidden', 'Admin access is required')
  }
  const icon = input.icon ?? 'Globe'
  if (!isResourceIcon(icon)) throw badRequest('Unknown icon')
  const parse = normalizeConnectorParseConfig(input.parse)
  const retention = (input.retention ?? { mode: 'forever' }) as { mode: string; missingAfterDays?: number }
  if (retention.mode === 'drop_missing' && !parse.externalIdPath) {
    throw badRequest('Retention requires an external id field in the connector mapping')
  }
  const [row] = await db
    .insert(dataConnectors)
    .values({
      organizationId: orgId,
      projectId: input.projectId ?? null,
      name: input.name.trim(),
      icon,
      enabled: input.enabled ?? true,
      source: input.source,
      auth: input.auth ?? { type: 'none' },
      format: input.format,
      parse,
      schedule: input.schedule ?? { preset: 'manual', timezone: 'UTC' },
      retention,
      authSecretEncrypted: input.apiKey ? encryptString(env.CREDENTIALS_KEY, input.apiKey) : null,
      createdBy: subject.id,
    })
    .returning()
  await writeAudit(db, subject, { action: 'connector.create', resourceType: 'connector', resourceId: row.id })
  return presentConnector(row)
}

export async function updateConnector(
  db: AppDatabase,
  env: Env,
  subject: Subject,
  id: string,
  input: {
    name?: string
    icon?: string
    projectId?: string | null
    enabled?: boolean
    source?: Record<string, unknown>
    auth?: ConnectorAuthConfig
    format?: string
    parse?: unknown
    schedule?: Record<string, unknown>
    retention?: Record<string, unknown>
    apiKey?: string
  },
) {
  const [existing] = await db.select().from(dataConnectors).where(eq(dataConnectors.id, id)).limit(1)
  if (!existing) throw notFound()
  await assertConnectorManage(db, subject, existing)
  if (input.icon !== undefined && !isResourceIcon(input.icon)) throw badRequest('Unknown icon')
  const parse = input.parse !== undefined ? normalizeConnectorParseConfig(input.parse) : normalizeConnectorParseConfig(existing.parse)
  const retention = (input.retention ?? existing.retention) as { mode: string; missingAfterDays?: number }
  if (retention.mode === 'drop_missing' && !parse.externalIdPath) {
    throw badRequest('Retention requires an external id field in the connector mapping')
  }
  const [row] = await db
    .update(dataConnectors)
    .set({
      name: input.name?.trim() ?? existing.name,
      icon: input.icon ?? existing.icon,
      projectId: input.projectId === undefined ? existing.projectId : input.projectId,
      enabled: input.enabled ?? existing.enabled,
      source: input.source ?? existing.source,
      auth: input.auth ?? existing.auth,
      format: input.format ?? existing.format,
      parse,
      schedule: input.schedule ?? existing.schedule,
      retention,
      authSecretEncrypted: input.apiKey ? encryptString(env.CREDENTIALS_KEY, input.apiKey) : existing.authSecretEncrypted,
      updatedAt: new Date(),
    })
    .where(eq(dataConnectors.id, id))
    .returning()
  await writeAudit(db, subject, { action: 'connector.update', resourceType: 'connector', resourceId: id })
  return presentConnector(row)
}

export async function deleteConnector(db: AppDatabase, subject: Subject, id: string) {
  const [existing] = await db.select().from(dataConnectors).where(eq(dataConnectors.id, id)).limit(1)
  if (!existing) throw notFound()
  await assertConnectorManage(db, subject, existing)
  await db.delete(dataConnectors).where(eq(dataConnectors.id, id))
  await writeAudit(db, subject, { action: 'connector.delete', resourceType: 'connector', resourceId: id })
  return { ok: true }
}

export async function previewConnector(db: AppDatabase, env: Env, subject: Subject, id: string, limit = 10) {
  const [row] = await db.select().from(dataConnectors).where(eq(dataConnectors.id, id)).limit(1)
  if (!row) throw notFound()
  await assertConnectorVisible(db, subject, row)
  const parse = normalizeConnectorParseConfig(row.parse)
  const auth = row.auth as ConnectorAuthConfig
  const body = await fetchConnectorPayload(row.source as never, auth, connectorApiKey(env, row))
  const format = row.format as 'json' | 'csv' | 'xml' | 'html'
  let recordsPathSuggestions: string[] = []
  if (format === 'json') {
    const root = JSON.parse(body) as unknown
    recordsPathSuggestions = suggestJsonRecordsPaths(root)
    const records = extractJsonRecords(root, parse)
    const sampleKeys = sampleFieldKeysFromRecords(records)
    const mapped = extractRecordsFromPayload(format, body, parse).slice(0, limit)
    return { recordsPathSuggestions, sampleKeys, rows: mapped }
  }
  const mapped = extractRecordsFromPayload(format, body, parse).slice(0, limit)
  const sampleKeys = mapped.length > 0 ? Object.keys(mapped[0]) : []
  return { recordsPathSuggestions, sampleKeys, rows: mapped }
}

export async function connectorHistory(db: AppDatabase, subject: Subject, id: string) {
  const [row] = await db.select().from(dataConnectors).where(eq(dataConnectors.id, id)).limit(1)
  if (!row) throw notFound()
  await assertConnectorVisible(db, subject, row)
  const jobs = await db
    .select()
    .from(connectorSyncJobs)
    .where(eq(connectorSyncJobs.connectorId, id))
    .orderBy(desc(connectorSyncJobs.createdAt))
    .limit(50)
  return jobs.map((job) => ({
    id: job.id,
    status: job.status,
    error: job.error,
    stats: job.stats,
    tableId: job.tableId,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
  }))
}

export async function queueConnectorSync(db: AppDatabase, env: Env, subject: Subject, connectorId: string, tableId?: string) {
  const [row] = await db.select().from(dataConnectors).where(eq(dataConnectors.id, connectorId)).limit(1)
  if (!row) throw notFound()
  await assertConnectorManage(db, subject, row)
  const [syncJob] = await db
    .insert(connectorSyncJobs)
    .values({ connectorId, tableId: tableId ?? null, status: 'running' })
    .returning()
  const job = await createJob(
    db,
    'connector.sync',
    { type: 'connector.sync', connectorId, tableId, actorUserId: subject.id, syncJobId: syncJob.id },
    subject.id,
  )
  const queueInRedis = Boolean(env.REDIS_URL?.trim()) && env.NODE_ENV === 'production'
  const queued = queueInRedis ? await enqueueBackgroundJob(env, job.id) : false
  if (!queued) {
    try {
      await dispatchBackgroundJob(db, env, job.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sync failed'
      await db.update(connectorSyncJobs).set({ status: 'failed', error: message, finishedAt: new Date() }).where(eq(connectorSyncJobs.id, syncJob.id))
      throw error
    }
  }
  return { jobId: job.id, syncJobId: syncJob.id }
}

export async function getTableBinding(db: AppDatabase, subject: Subject, tableId: string) {
  await assertCan(db, subject, 'view', { type: 'table', id: tableId, parents: { project: await tableProjectId(db, tableId) } })
  const [binding] = await db.select().from(tableConnectorBindings).where(eq(tableConnectorBindings.tableId, tableId)).limit(1)
  if (!binding) return null
  const connector = await getConnector(db, subject, binding.connectorId)
  return { binding: { ...binding, columnMap: binding.columnMap, syncMode: binding.syncMode }, connector }
}

export async function patchTableBinding(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  input: { columnMap: Record<string, string>; syncMode?: 'append_only' | 'upsert' },
) {
  const projectId = await tableProjectId(db, tableId)
  await assertCan(db, subject, 'manage_structure', { type: 'table', id: tableId, parents: { project: projectId } })
  const [binding] = await db.select().from(tableConnectorBindings).where(eq(tableConnectorBindings.tableId, tableId)).limit(1)
  if (!binding) throw notFound()
  const [updated] = await db
    .update(tableConnectorBindings)
    .set({
      columnMap: input.columnMap,
      syncMode: input.syncMode ?? binding.syncMode,
      updatedAt: new Date(),
    })
    .where(eq(tableConnectorBindings.id, binding.id))
    .returning()
  return updated
}

export async function bindConnectorToTable(
  db: AppDatabase,
  env: Env,
  subject: Subject,
  connectorId: string,
  tableId: string,
) {
  const [connector] = await db.select().from(dataConnectors).where(eq(dataConnectors.id, connectorId)).limit(1)
  if (!connector) throw notFound()
  await assertConnectorVisible(db, subject, connector)
  const projectId = await tableProjectId(db, tableId)
  await assertCan(db, subject, 'manage_structure', { type: 'table', id: tableId, parents: { project: projectId } })
  const [existingBinding] = await db.select().from(tableConnectorBindings).where(eq(tableConnectorBindings.tableId, tableId)).limit(1)
  if (existingBinding) throw badRequest('This table is already linked to a connector')
  const parse = normalizeConnectorParseConfig(connector.parse)
  if (parse.fields.length === 0) throw badRequest('Connector has no field mappings')
  const columns = await loadColumns(db, tableId)
  const columnMap: Record<string, string> = {}
  for (const field of parse.fields) {
    const label = (field.targetLabel ?? field.targetFieldKey).trim()
    const column =
      columns.find((item) => item.name.toLowerCase() === label.toLowerCase()) ??
      columns.find((item) => item.name.toLowerCase() === field.targetFieldKey.toLowerCase())
    if (!column) throw badRequest(`Table is missing a column named “${label}”`)
    columnMap[field.targetFieldKey] = column.id
  }
  const syncMode = parse.externalIdPath ? 'upsert' : 'append_only'
  const [binding] = await db
    .insert(tableConnectorBindings)
    .values({ tableId, connectorId, columnMap, syncMode })
    .returning()
  await queueConnectorSync(db, env, subject, connectorId, tableId)
  return { binding: { id: binding.id, tableId, connectorId, columnMap, syncMode } }
}

export async function createTableFromConnector(
  db: AppDatabase,
  env: Env,
  subject: Subject,
  projectId: string,
  input: { connectorId: string; name?: string; icon?: string },
) {
  await assertCan(db, subject, 'manage_structure', { type: 'project', id: projectId })
  const [connector] = await db.select().from(dataConnectors).where(eq(dataConnectors.id, input.connectorId)).limit(1)
  if (!connector) throw notFound()
  await assertConnectorVisible(db, subject, connector)
  const parse = normalizeConnectorParseConfig(connector.parse)
  if (parse.fields.length === 0) throw badRequest('Connector has no field mappings')
  const icon = input.icon ?? 'Table'
  if (!isResourceIcon(icon)) throw badRequest('Unknown icon')
  const name = input.name?.trim() || (await nextTableName(db, projectId))
  const preview = await previewConnector(db, env, subject, connector.id, 1)
  const table = await db.transaction(async (tx) => {
    const position = await nextTablePosition(tx as unknown as AppDatabase, projectId)
    const [created] = await tx
      .insert(tables)
      .values({ projectId, name, icon, description: '', position, createdBy: subject.id })
      .returning()
    let lastPos: string | null = null
    const columnMap: Record<string, string> = {}
    for (const field of parse.fields) {
      lastPos = generateKeyBetween(lastPos, null)
      const label = field.targetLabel ?? field.targetFieldKey
      const sample = preview.rows[0]?.[field.targetFieldKey] ?? ''
      const type = inferColumnType(field.coerce, sample)
      const [column] = await tx
        .insert(tableColumns)
        .values({
          tableId: created.id,
          name: label,
          type,
          config: { icon: defaultColumnIcon(type) },
          position: lastPos,
        })
        .returning()
      columnMap[field.targetFieldKey] = column.id
    }
    const syncMode = parse.externalIdPath ? 'upsert' : 'append_only'
    await tx.insert(tableConnectorBindings).values({
      tableId: created.id,
      connectorId: connector.id,
      columnMap,
      syncMode,
    })
    await writeAudit(tx as unknown as AppDatabase, subject, { action: 'table.create', resourceType: 'table', resourceId: created.id, metadata: { connectorId: connector.id } })
    return presentTable(created)
  })
  await queueConnectorSync(db, env, subject, connector.id, table.id)
  return { table }
}

async function tableProjectId(db: AppDatabase, tableId: string) {
  const [table] = await db.select({ projectId: tables.projectId }).from(tables).where(eq(tables.id, tableId)).limit(1)
  if (!table) throw notFound()
  return table.projectId
}

function inferColumnType(coerce: string | undefined, sample: string) {
  if (coerce === 'number') return 'number'
  if (coerce === 'boolean') return 'checkbox'
  if (coerce === 'date') return 'date'
  if (/^-?\d+(\.\d+)?$/.test(sample.trim())) return 'number'
  return 'text'
}

export async function listScheduledConnectors(db: AppDatabase) {
  return db
    .select()
    .from(dataConnectors)
    .where(and(eq(dataConnectors.enabled, true), sql`${dataConnectors.schedule}->>'preset' <> 'manual'`))
}

export function presentConnectorRow(row: ConnectorRow) {
  return presentConnector(row)
}
