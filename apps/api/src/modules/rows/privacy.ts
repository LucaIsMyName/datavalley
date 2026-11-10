import { and, eq, inArray, or, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { connectorRowLinks, relationRecords, tableCells, tableRows } from '../../database/schema.js'
import { AppError, notFound } from '../../errors.js'
import { allows, assertCan, resolveGrants } from '../../security/access.js'
import type { Subject } from '../../security/subject.js'
import { loadColumns, resolveTableContext } from '../tables/service.js'
import { readCell } from '../../column-types/index.js'
import { historyLabel } from './history.js'
import { rowDisplayTitle } from './titles.js'
import { deleteRow } from './service.js'
import { visibleColumns } from './visible-columns.js'

async function connectorIds(db: AppDatabase, rowIds: string[]) {
  if (rowIds.length === 0) return new Set<string>()
  const links = await db
    .select({ rowId: connectorRowLinks.rowId })
    .from(connectorRowLinks)
    .where(inArray(connectorRowLinks.rowId, rowIds))
  return new Set(links.map((link) => link.rowId))
}

function isNotFound(error: unknown): error is AppError {
  return error instanceof AppError && error.status === 404
}

async function snapshot(db: AppDatabase, subject: Subject, rowId: string) {
  const [row] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
  if (!row) throw notFound()
  const { shell, physical } = await resolveTableContext(db, subject, row.tableId, 'view')
  await assertCan(db, subject, 'view', {
    type: 'row',
    id: row.id,
    parents: { table: shell.id, project: shell.projectId },
  })
  const columns = await visibleColumns(
    db,
    subject,
    shell.id,
    shell.projectId,
    await loadColumns(db, physical.id),
  )
  const cells = await db.select().from(tableCells).where(eq(tableCells.rowId, row.id))
  const grants = await resolveGrants(db, subject)
  const values: Record<string, unknown> = {}
  const labeled: Record<string, string> = {}
  for (const column of columns) {
    const value = readCell(column, cells.find((cell) => cell.columnId === column.id))
    if (column.type === 'relation' && typeof value === 'string') {
      const toTableId = String(column.config.toTableId ?? '')
      if (
        toTableId &&
        !allows(subject, grants, 'view', {
          type: 'row',
          id: value,
          parents: { table: toTableId, project: shell.projectId },
        })
      ) {
        continue
      }
    }
    values[column.id] = value
    const text = historyLabel(column, value, new Map()).trim()
    if (text) labeled[column.name] = text
  }
  const mainColumnId = (physical.headerConfig as { mainColumnId?: string } | null)?.mainColumnId
  return {
    id: row.id,
    tableId: shell.id,
    table: shell.name,
    title: rowDisplayTitle(columns, values, new Map(), row.id, mainColumnId),
    cells: labeled,
  }
}

async function snapshotIfAllowed(db: AppDatabase, subject: Subject, rowId: string) {
  try {
    return await snapshot(db, subject, rowId)
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

export async function exportPerson(db: AppDatabase, subject: Subject, rowId: string) {
  const [stored] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
  if (!stored) throw notFound()
  await resolveTableContext(db, subject, stored.tableId, 'view')
  const links = await db
    .select({ rowId: relationRecords.fromRowId })
    .from(relationRecords)
    .where(or(eq(relationRecords.fromRowId, rowId), eq(relationRecords.toRowId, rowId)))
  const outgoing = await db
    .select({ valueJsonb: tableCells.valueJsonb })
    .from(tableCells)
    .where(eq(tableCells.rowId, rowId))
  const relatedIds = new Set<string>()
  for (const link of links) {
    if (link.rowId !== rowId) relatedIds.add(link.rowId)
  }
  const incoming = await db
    .select({ rowId: relationRecords.fromRowId, toRowId: relationRecords.toRowId })
    .from(relationRecords)
    .where(or(eq(relationRecords.fromRowId, rowId), eq(relationRecords.toRowId, rowId)))
  for (const link of incoming) {
    if (link.rowId !== rowId) relatedIds.add(link.rowId)
    if (link.toRowId !== rowId) relatedIds.add(link.toRowId)
  }
  for (const cell of outgoing) {
    const target = (cell.valueJsonb as { rowId?: string } | null)?.rowId
    if (target) relatedIds.add(target)
  }
  relatedIds.delete(rowId)
  const connected = await connectorIds(db, [rowId, ...relatedIds])
  const related = []
  for (const id of relatedIds) {
    const item = await snapshotIfAllowed(db, subject, id)
    if (!item) continue
    related.push({ ...item, connector: connected.has(id) })
  }
  const row = await snapshot(db, subject, rowId)
  return { row: { ...row, connector: connected.has(rowId) }, related }
}

export async function removePerson(db: AppDatabase, subject: Subject, rowId: string) {
  const [stored] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
  if (!stored) throw notFound()
  const { shell } = await resolveTableContext(db, subject, stored.tableId, 'delete')
  await assertCan(db, subject, 'delete', {
    type: 'row',
    id: stored.id,
    parents: { table: shell.id, project: shell.projectId },
  })
  const connected = await connectorIds(db, [rowId])
  await db.delete(relationRecords).where(or(eq(relationRecords.fromRowId, rowId), eq(relationRecords.toRowId, rowId)))
  await db.delete(tableCells).where(and(eq(tableCells.rowId, rowId), sql`${tableCells.valueJsonb}->>'rowId' is not null`))
  await db.delete(tableCells).where(sql`${tableCells.valueJsonb}->>'rowId' = ${rowId}`)
  if (connected.has(rowId)) return { removed: false, connector: true }
  await deleteRow(db, subject, rowId)
  return { removed: true, connector: false }
}
