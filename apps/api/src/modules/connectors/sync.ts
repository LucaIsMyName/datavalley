import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import {
  extractJsonRecords,
  extractRecordsFromPayload,
  externalKeyFromMapped,
  getValueAtPath,
  normalizeConnectorParseConfig,
  type ConnectorParseConfig,
} from '@datavalley/shared'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import {
  connectorRowLinks,
  connectorSyncJobs,
  dataConnectors,
  tableCells,
  tableConnectorBindings,
  tableRows,
  tables,
} from '../../database/schema.js'
import { parseCell } from '../../column-types/index.js'
import { badRequest, notFound } from '../../errors.js'
import { writeAudit } from '../../security/audit.js'
import { decryptString } from '../../security/crypto.js'
import type { Subject } from '../../security/subject.js'
import { loadColumns, type LoadedColumn } from '../tables/service.js'
import { assertTableDataEditable } from '../tables/resolve.js'
import { fetchConnectorPayload, type ConnectorAuthConfig } from './fetch.js'
import { connectorApiKey } from './service.js'
import { generateKeyBetween } from 'fractional-indexing'

export async function executeConnectorSyncJob(
  db: AppDatabase,
  env: Env,
  input: { connectorId: string; tableId?: string; actorUserId?: string; syncJobId?: string },
) {
  try {
    return await runConnectorSync(db, env, input)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed'
    if (input.syncJobId) {
      await db
        .update(connectorSyncJobs)
        .set({ status: 'failed', error: message, finishedAt: new Date() })
        .where(eq(connectorSyncJobs.id, input.syncJobId))
    }
    throw error
  }
}

async function runConnectorSync(
  db: AppDatabase,
  env: Env,
  input: { connectorId: string; tableId?: string; actorUserId?: string; syncJobId?: string },
) {
  const connector = await loadConnector(db, input.connectorId)
  if (!connector.enabled) throw badRequest('Connector is disabled')
  const parse = normalizeConnectorParseConfig(connector.parse)
  validateRetention(parse, connector.retention as { mode: string; missingAfterDays?: number })
  const bindings = await listBindings(db, input.connectorId, input.tableId)
  if (bindings.length === 0) {
    throw badRequest('Connector has no linked tables. Create a table via “From connector” or link an existing table.')
  }
  const auth = connector.auth as ConnectorAuthConfig
  const apiKey = connectorApiKey(env, connector)
  const body = await fetchConnectorPayload(connector.source as never, auth, apiKey)
  const format = connector.format as 'json' | 'csv' | 'xml' | 'html'
  const mappedRows = extractRecordsFromPayload(format, body, parse)
  const jsonRecords = format === 'json' ? extractJsonRecords(JSON.parse(body), parse) : []
  const stats = { imported: 0, updated: 0, deleted: 0, bindings: bindings.length }
  const actor = input.actorUserId ? ({ id: input.actorUserId, kind: 'user', role: 'admin', source: 'web', user: null } as Subject) : null
  for (const binding of bindings) {
    const result = await syncBinding(db, connector.id, binding, mappedRows, jsonRecords, parse, format, actor)
    stats.imported += result.imported
    stats.updated += result.updated
    stats.deleted += result.deleted
  }
  if (input.syncJobId) {
    await db
      .update(connectorSyncJobs)
      .set({ status: 'completed', stats, finishedAt: new Date() })
      .where(eq(connectorSyncJobs.id, input.syncJobId))
  }
  if (actor) {
    await writeAudit(db, actor, {
      action: 'connector.sync',
      resourceType: 'connector',
      resourceId: connector.id,
      metadata: stats,
    })
  }
  return stats
}

async function syncBinding(
  db: AppDatabase,
  connectorId: string,
  binding: typeof tableConnectorBindings.$inferSelect,
  mappedRows: Record<string, string>[],
  jsonRecords: unknown[],
  parse: ConnectorParseConfig,
  format: string,
  actor: Subject | null,
) {
  const [table] = await db.select().from(tables).where(eq(tables.id, binding.tableId)).limit(1)
  if (!table) throw notFound()
  assertTableDataEditable(table)
  const columns = await loadColumns(db, table.id)
  const columnMap = binding.columnMap as Record<string, string>
  const syncMode = binding.syncMode === 'append_only' ? 'append_only' : 'upsert'
  const seenKeys = new Set<string>()
  let imported = 0
  let updated = 0
  let rowPos: string | null = (
    await db.select({ position: tableRows.position }).from(tableRows).where(eq(tableRows.tableId, table.id)).orderBy(asc(tableRows.position))
  )
    .map((row) => row.position)
    .sort()
    .at(-1) ?? null
  await db.transaction(async (tx) => {
    for (let index = 0; index < mappedRows.length; index += 1) {
      const mapped = mappedRows[index]
      const rawRecord = format === 'json' ? jsonRecords[index] : mapped
      const externalKey =
        (format === 'json' && parse.externalIdPath ? String(getValueAtPath(rawRecord, parse.externalIdPath) ?? '') : externalKeyFromMapped(mapped, parse)) ||
        null
      if (externalKey) seenKeys.add(externalKey)
      if (syncMode === 'upsert' && externalKey) {
        const [link] = await tx
          .select()
          .from(connectorRowLinks)
          .where(and(eq(connectorRowLinks.tableId, table.id), eq(connectorRowLinks.externalKey, externalKey)))
          .limit(1)
        if (link) {
          await writeMappedCells(tx as unknown as AppDatabase, table.id, link.rowId, columns, columnMap, mapped)
          await tx.update(connectorRowLinks).set({ lastSeenAt: new Date() }).where(eq(connectorRowLinks.id, link.id))
          updated += 1
          continue
        }
      }
      rowPos = generateKeyBetween(rowPos, null)
      const [numbered] = await tx
        .update(tables)
        .set({ nextRowNumber: sql`${tables.nextRowNumber} + 1` })
        .where(eq(tables.id, table.id))
        .returning({ nextRowNumber: tables.nextRowNumber })
      const [row] = await tx
        .insert(tableRows)
        .values({ tableId: table.id, position: rowPos, rowNumber: numbered.nextRowNumber - 1, createdBy: actor?.id ?? null })
        .returning()
      await writeMappedCells(tx as unknown as AppDatabase, table.id, row.id, columns, columnMap, mapped)
      if (externalKey && syncMode === 'upsert') {
        await tx.insert(connectorRowLinks).values({ tableId: table.id, externalKey, rowId: row.id, lastSeenAt: new Date() })
      }
      imported += 1
    }
  })
  const retention = await loadConnector(db, connectorId)
  const policy = retention.retention as { mode: string; missingAfterDays?: number }
  let deleted = 0
  if (policy.mode === 'drop_missing' && parse.externalIdPath) {
    deleted = await applyRetention(db, table.id, seenKeys, policy.missingAfterDays ?? 7)
  }
  await db
    .update(tableConnectorBindings)
    .set({ lastSyncAt: new Date(), lastSyncStatus: 'completed', lastError: null, updatedAt: new Date() })
    .where(eq(tableConnectorBindings.id, binding.id))
  return { imported, updated, deleted }
}

async function writeMappedCells(
  db: AppDatabase,
  tableId: string,
  rowId: string,
  columns: LoadedColumn[],
  columnMap: Record<string, string>,
  mapped: Record<string, string>,
) {
  for (const [fieldKey, columnId] of Object.entries(columnMap)) {
    const column = columns.find((item) => item.id === columnId)
    if (!column || column.type === 'formula' || column.type === 'row_id') continue
    const raw = mapped[fieldKey] ?? ''
    if (raw === '') {
      await db.delete(tableCells).where(and(eq(tableCells.rowId, rowId), eq(tableCells.columnId, columnId)))
      continue
    }
    const parsed = parseCell(column, raw)
    await db.delete(tableCells).where(and(eq(tableCells.rowId, rowId), eq(tableCells.columnId, columnId)))
    if (!parsed) continue
    await db.insert(tableCells).values({
      tableId,
      rowId,
      columnId,
      valueText: parsed.valueText ?? null,
      valueNumber: parsed.valueNumber ?? null,
      valueBool: parsed.valueBool ?? null,
      valueTimestamptz: parsed.valueTimestamptz ?? null,
      valueJsonb: (parsed.valueJsonb ?? null) as never,
      formatRules: [],
    })
  }
}

async function applyRetention(db: AppDatabase, tableId: string, seenKeys: Set<string>, missingAfterDays: number) {
  const cutoff = new Date(Date.now() - missingAfterDays * 86_400_000)
  const links = await db.select().from(connectorRowLinks).where(eq(connectorRowLinks.tableId, tableId))
  const doomed = links.filter((link) => !seenKeys.has(link.externalKey) && link.lastSeenAt < cutoff)
  if (doomed.length === 0) return 0
  const rowIds = doomed.map((link) => link.rowId)
  await db.delete(connectorRowLinks).where(inArray(connectorRowLinks.id, doomed.map((link) => link.id)))
  await db.delete(tableRows).where(inArray(tableRows.id, rowIds))
  return rowIds.length
}

function validateRetention(parse: ConnectorParseConfig, retention: { mode: string; missingAfterDays?: number }) {
  if (retention.mode === 'drop_missing' && !parse.externalIdPath) {
    throw badRequest('Retention requires an external id field in the connector mapping')
  }
}

async function listBindings(db: AppDatabase, connectorId: string, tableId?: string) {
  if (tableId) {
    return db
      .select()
      .from(tableConnectorBindings)
      .where(and(eq(tableConnectorBindings.connectorId, connectorId), eq(tableConnectorBindings.tableId, tableId)))
  }
  return db.select().from(tableConnectorBindings).where(eq(tableConnectorBindings.connectorId, connectorId))
}

async function loadConnector(db: AppDatabase, id: string) {
  const [row] = await db.select().from(dataConnectors).where(eq(dataConnectors.id, id)).limit(1)
  if (!row) throw notFound()
  return row
}
