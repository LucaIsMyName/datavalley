import { and, eq, inArray, or, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { connectorRowLinks, relationRecords, tableCells, tableRows, tables } from '../../database/schema.js'
import { notFound } from '../../errors.js'
import type { Subject } from '../../security/subject.js'
import { loadColumns, resolveTableContext } from '../tables/service.js'
import { readCell } from '../../column-types/index.js'
import { historyLabel } from './history.js'
import { rowDisplayTitle } from './titles.js'
import { deleteRow } from './service.js'

async function connectorIds(db: AppDatabase, rowIds: string[]) {
  if (rowIds.length === 0) return new Set<string>()
  const links = await db
    .select({ rowId: connectorRowLinks.rowId })
    .from(connectorRowLinks)
    .where(inArray(connectorRowLinks.rowId, rowIds))
  return new Set(links.map((link) => link.rowId))
}

async function snapshot(db: AppDatabase, rowId: string) {
  const [row] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
  if (!row) throw notFound()
  const [table] = await db.select().from(tables).where(eq(tables.id, row.tableId)).limit(1)
  if (!table) throw notFound()
  const columns = await loadColumns(db, table.id)
  const cells = await db.select().from(tableCells).where(eq(tableCells.rowId, row.id))
  const values: Record<string, unknown> = {}
  const labeled: Record<string, string> = {}
  for (const column of columns) {
    const value = readCell(column, cells.find((cell) => cell.columnId === column.id))
    values[column.id] = value
    const text = historyLabel(column, value, new Map()).trim()
    if (text) labeled[column.name] = text
  }
  const mainColumnId = (table.headerConfig as { mainColumnId?: string } | null)?.mainColumnId
  return {
    id: row.id,
    tableId: table.id,
    table: table.name,
    title: rowDisplayTitle(columns, values, new Map(), row.id, mainColumnId),
    cells: labeled,
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
    const item = await snapshot(db, id)
    related.push({ ...item, connector: connected.has(id) })
  }
  const row = await snapshot(db, rowId)
  return { row: { ...row, connector: connected.has(rowId) }, related }
}

export async function removePerson(db: AppDatabase, subject: Subject, rowId: string) {
  const [stored] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
  if (!stored) throw notFound()
  await resolveTableContext(db, subject, stored.tableId, 'delete')
  const connected = await connectorIds(db, [rowId])
  await db.delete(relationRecords).where(or(eq(relationRecords.fromRowId, rowId), eq(relationRecords.toRowId, rowId)))
  await db.delete(tableCells).where(and(eq(tableCells.rowId, rowId), sql`${tableCells.valueJsonb}->>'rowId' is not null`))
  await db.delete(tableCells).where(sql`${tableCells.valueJsonb}->>'rowId' = ${rowId}`)
  if (connected.has(rowId)) return { removed: false, connector: true }
  await deleteRow(db, subject, rowId)
  return { removed: true, connector: false }
}
