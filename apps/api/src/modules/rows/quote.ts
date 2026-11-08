import { eq, inArray } from 'drizzle-orm'
import { readCell } from '../../column-types/index.js'
import type { AppDatabase } from '../../database/client.js'
import { relationRecords, relations, tableCells, tableRows, tables } from '../../database/schema.js'
import { notFound } from '../../errors.js'
import type { Subject } from '../../security/subject.js'
import { loadColumns, resolveTableContext } from '../tables/service.js'
import { historyLabel } from './history.js'
import { rowDisplayTitle } from './titles.js'

export async function quoteSummary(db: AppDatabase, subject: Subject, rowId: string) {
  const [stored] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
  if (!stored) throw notFound()
  const { physical } = await resolveTableContext(db, subject, stored.tableId, 'view')
  const [table] = await db.select().from(tables).where(eq(tables.id, physical.id)).limit(1)
  if (!table) throw notFound()
  const columns = await loadColumns(db, table.id)
  const status = columns.find((column) => column.type === 'select' && column.name.trim().toLowerCase() === 'status')
  const cells = await db.select().from(tableCells).where(eq(tableCells.rowId, rowId))
  const values: Record<string, unknown> = {}
  for (const column of columns) values[column.id] = readCell(column, cells.find((cell) => cell.columnId === column.id))
  const links = await db
    .select({ fromRowId: relationRecords.fromRowId, relationId: relationRecords.relationId })
    .from(relationRecords)
    .where(eq(relationRecords.toRowId, rowId))
  const relationRows = links.length
    ? await db.select().from(relations).where(inArray(relations.id, [...new Set(links.map((link) => link.relationId))]))
    : []
  const lineIds = links
    .filter((link) => relationRows.find((relation) => relation.id === link.relationId)?.fromTableId !== table.id)
    .map((link) => link.fromRowId)
  const lines = []
  for (const lineId of lineIds) {
    const line = await lineSummary(db, lineId)
    if (line) lines.push(line)
  }
  if (!status && lines.length === 0) throw notFound()
  const customer = columns.find((column) => column.type === 'text' && column.name.trim().toLowerCase() === 'customer')
  const mainColumnId = (table.headerConfig as { mainColumnId?: string } | null)?.mainColumnId
  return {
    title: rowDisplayTitle(columns, values, new Map(), rowId, mainColumnId),
    status: status ? historyLabel(status, values[status.id], new Map()) : '',
    customer: customer ? historyLabel(customer, values[customer.id], new Map()) : '',
    lines,
    total: lines.reduce((sum, line) => sum + line.amount, 0),
  }
}

async function lineSummary(db: AppDatabase, rowId: string) {
  const [row] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
  if (!row) return null
  const columns = await loadColumns(db, row.tableId)
  const quantityColumn = columns.find((column) => column.type === 'number' && column.name.trim().toLowerCase() === 'quantity')
  const productColumn = columns.find(
    (column) => column.type === 'relation' && column.name.trim().toLowerCase() === 'product',
  )
  if (!quantityColumn || !productColumn) return null
  const cells = await db.select().from(tableCells).where(eq(tableCells.rowId, rowId))
  const quantity = Number(readCell(quantityColumn, cells.find((cell) => cell.columnId === quantityColumn.id)) ?? 0)
  const productId = readCell(productColumn, cells.find((cell) => cell.columnId === productColumn.id))
  if (typeof productId !== 'string' || !productId) return null
  const product = await productSummary(db, productId)
  if (!product) return null
  return {
    product: product.title,
    quantity,
    price: product.price,
    amount: quantity * product.price,
  }
}

async function productSummary(db: AppDatabase, rowId: string) {
  const [row] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
  if (!row) return null
  const columns = await loadColumns(db, row.tableId)
  const cells = await db.select().from(tableCells).where(eq(tableCells.rowId, rowId))
  const values: Record<string, unknown> = {}
  for (const column of columns) values[column.id] = readCell(column, cells.find((cell) => cell.columnId === column.id))
  const priceColumn = columns.find((column) => column.type === 'number')
  const price = Number(priceColumn ? values[priceColumn.id] ?? 0 : 0)
  const mainColumnId = (await db.select().from(tables).where(eq(tables.id, row.tableId)).limit(1))[0]
  const header = (mainColumnId?.headerConfig as { mainColumnId?: string } | null)?.mainColumnId
  return { title: rowDisplayTitle(columns, values, new Map(), rowId, header), price }
}
