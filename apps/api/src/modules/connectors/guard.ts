import { eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { dataConnectors, tableConnectorBindings } from '../../database/schema.js'
import { conflict } from '../../errors.js'

export const CONNECTOR_BOUND_MESSAGE =
  'This table is updated by a connector. Disconnect it to edit.'

export type TableConnectorSummary = {
  id: string
  name: string
  lastSyncAt: string | null
  lastSyncStatus: string | null
  lastError: string | null
}

export async function tableHasConnectorBinding(db: AppDatabase, tableId: string) {
  const [binding] = await db
    .select({ id: tableConnectorBindings.id })
    .from(tableConnectorBindings)
    .where(eq(tableConnectorBindings.tableId, tableId))
    .limit(1)
  return Boolean(binding)
}

export async function assertNoConnectorBinding(db: AppDatabase, tableId: string) {
  if (await tableHasConnectorBinding(db, tableId)) throw conflict(CONNECTOR_BOUND_MESSAGE)
}

function presentTableConnector(row: {
  id: string
  name: string
  lastSyncAt: Date | null
  lastSyncStatus: string | null
  lastError: string | null
}): TableConnectorSummary {
  return {
    id: row.id,
    name: row.name,
    lastSyncAt: row.lastSyncAt ? row.lastSyncAt.toISOString() : null,
    lastSyncStatus: row.lastSyncStatus,
    lastError: row.lastError,
  }
}

const connectorSummaryColumns = {
  tableId: tableConnectorBindings.tableId,
  id: dataConnectors.id,
  name: dataConnectors.name,
  lastSyncAt: tableConnectorBindings.lastSyncAt,
  lastSyncStatus: tableConnectorBindings.lastSyncStatus,
  lastError: tableConnectorBindings.lastError,
}

export async function loadTableConnector(
  db: AppDatabase,
  tableId: string,
): Promise<TableConnectorSummary | null> {
  const [row] = await db
    .select(connectorSummaryColumns)
    .from(tableConnectorBindings)
    .innerJoin(dataConnectors, eq(dataConnectors.id, tableConnectorBindings.connectorId))
    .where(eq(tableConnectorBindings.tableId, tableId))
    .limit(1)
  if (!row) return null
  return presentTableConnector(row)
}

export async function loadTableConnectors(db: AppDatabase, tableIds: string[]) {
  const byTable = new Map<string, TableConnectorSummary>()
  if (tableIds.length === 0) return byTable
  const rows = await db
    .select(connectorSummaryColumns)
    .from(tableConnectorBindings)
    .innerJoin(dataConnectors, eq(dataConnectors.id, tableConnectorBindings.connectorId))
    .where(inArray(tableConnectorBindings.tableId, tableIds))
  for (const row of rows) byTable.set(row.tableId, presentTableConnector(row))
  return byTable
}
