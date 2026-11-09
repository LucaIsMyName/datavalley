import { and, eq, inArray } from 'drizzle-orm'
import { readCell } from '../../column-types/index.js'
import type { AppDatabase } from '../../database/client.js'
import { relationRecords, tableCells, tableRows, tables } from '../../database/schema.js'
import { notFound } from '../../errors.js'
import { allows, assertCan, resolveGrants } from '../../security/access.js'
import type { Subject } from '../../security/subject.js'
import { readQuoteDocument } from '../tables/document.js'
import { loadColumns, resolveTableContext, type LoadedColumn } from '../tables/service.js'
import { displayLabels, historyLabel } from './history.js'
import { rowDisplayTitle } from './titles.js'
import { visibleColumns } from './visible-columns.js'

export async function quoteSummary(db: AppDatabase, subject: Subject, rowId: string) {
  const [stored] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
  if (!stored) throw notFound()
  const { shell, physical } = await resolveTableContext(db, subject, stored.tableId, 'view')
  await assertCan(db, subject, 'view', {
    type: 'row',
    id: rowId,
    parents: { table: shell.id, project: shell.projectId },
  })
  const quote = readQuoteDocument(physical.documentConfig)
  if (!quote) throw notFound()
  const columns = await loadColumns(db, physical.id)
  const visible = await visibleColumns(db, subject, shell.id, shell.projectId, columns)
  const customer = mappedColumn(columns, visible, quote.customerColumnId, false)
  const status = mappedColumn(columns, visible, quote.statusColumnId, false)
  const [linesTable] = await db
    .select()
    .from(tables)
    .where(eq(tables.id, quote.linesTableId))
    .limit(1)
  if (!linesTable || linesTable.projectId !== physical.projectId) throw notFound()
  const lineColumns = await loadColumns(db, linesTable.id)
  const lineVisible = await visibleColumns(
    db,
    subject,
    linesTable.id,
    linesTable.projectId,
    lineColumns,
  )
  const quoteColumn = mappedColumn(lineColumns, lineVisible, quote.quoteColumnId, true)
  const productColumn = mappedColumn(lineColumns, lineVisible, quote.productColumnId, true)
  const quantityColumn = mappedColumn(lineColumns, lineVisible, quote.quantityColumnId, true)
  if (!quoteColumn || !productColumn || !quantityColumn) throw notFound()
  const productTableId = configString(productColumn.config, 'toTableId')
  const relationId = configString(quoteColumn.config, 'relationId')
  if (!productTableId || !relationId) throw notFound()
  const [productTable] = await db
    .select()
    .from(tables)
    .where(eq(tables.id, productTableId))
    .limit(1)
  if (!productTable || productTable.projectId !== physical.projectId) throw notFound()
  const productColumns = await loadColumns(db, productTable.id)
  const productVisible = await visibleColumns(
    db,
    subject,
    productTable.id,
    productTable.projectId,
    productColumns,
  )
  const priceOnLine = lineColumns.find((column) => column.id === quote.priceColumnId)
  const priceColumn =
    priceOnLine ?? productColumns.find((column) => column.id === quote.priceColumnId)
  if (!priceColumn) throw notFound()
  const priceVisible = priceOnLine ? lineVisible : productVisible
  if (!priceVisible.some((column) => column.id === priceColumn.id)) throw notFound()

  const cells = await db.select().from(tableCells).where(eq(tableCells.rowId, rowId))
  const values = cellValues(columns, cells)
  const labels = await displayLabels(db, columns, values)
  const grants = await resolveGrants(db, subject)
  const links = await db
    .select({ fromRowId: relationRecords.fromRowId })
    .from(relationRecords)
    .where(and(eq(relationRecords.relationId, relationId), eq(relationRecords.toRowId, rowId)))
  const lineIds = links.map((link) => link.fromRowId)
  const lineRows = lineIds.length
    ? await db.select().from(tableRows).where(inArray(tableRows.id, lineIds))
    : []
  lineRows.sort((left, right) =>
    left.position < right.position ? -1 : left.position > right.position ? 1 : 0,
  )
  const lines = []
  for (const lineRow of lineRows) {
    if (
      !allows(subject, grants, 'view', {
        type: 'row',
        id: lineRow.id,
        parents: { table: linesTable.id, project: linesTable.projectId },
      })
    ) {
      continue
    }
    const line = await lineSummary(db, subject, grants, lineRow.id, {
      quantityColumn,
      productColumn,
      priceColumn,
      priceOnLine: Boolean(priceOnLine),
      productColumns,
      productVisible,
      productTable,
    })
    if (line) lines.push(line)
  }
  const mainColumnId = configString(physical.headerConfig, 'mainColumnId')
  return {
    title: rowDisplayTitle(visible, values, labels, rowId, mainColumnId),
    status: status ? historyLabel(status, values[status.id], labels) : '',
    customer: customer ? historyLabel(customer, values[customer.id], labels) : '',
    lines,
    total: lines.reduce((sum, line) => sum + line.amount, 0),
  }
}

async function lineSummary(
  db: AppDatabase,
  subject: Subject,
  grants: Awaited<ReturnType<typeof resolveGrants>>,
  rowId: string,
  input: {
    quantityColumn: LoadedColumn
    productColumn: LoadedColumn
    priceColumn: LoadedColumn
    priceOnLine: boolean
    productColumns: LoadedColumn[]
    productVisible: LoadedColumn[]
    productTable: { id: string; projectId: string; headerConfig: unknown }
  },
) {
  const cells = await db.select().from(tableCells).where(eq(tableCells.rowId, rowId))
  const lineColumns = [
    input.quantityColumn,
    input.productColumn,
    ...(input.priceOnLine ? [input.priceColumn] : []),
  ]
  const values = cellValues(lineColumns, cells)
  const quantity = asNumber(values[input.quantityColumn.id])
  const productId = values[input.productColumn.id]
  if (typeof productId !== 'string' || !productId) return null
  const [productRow] = await db.select().from(tableRows).where(eq(tableRows.id, productId)).limit(1)
  if (!productRow || productRow.tableId !== input.productTable.id) return null
  if (
    !allows(subject, grants, 'view', {
      type: 'row',
      id: productRow.id,
      parents: { table: input.productTable.id, project: input.productTable.projectId },
    })
  ) {
    return null
  }
  const productCells = await db.select().from(tableCells).where(eq(tableCells.rowId, productRow.id))
  const productValues = cellValues(input.productColumns, productCells)
  const labels = await displayLabels(db, input.productColumns, productValues)
  const price = input.priceOnLine
    ? asNumber(values[input.priceColumn.id])
    : asNumber(productValues[input.priceColumn.id])
  const mainColumnId = configString(input.productTable.headerConfig, 'mainColumnId')
  return {
    product: rowDisplayTitle(
      input.productVisible,
      productValues,
      labels,
      productRow.id,
      mainColumnId,
    ),
    quantity,
    price,
    amount: quantity * price,
  }
}

function mappedColumn(
  columns: LoadedColumn[],
  visible: LoadedColumn[],
  id: string | undefined,
  required: true,
): LoadedColumn
function mappedColumn(
  columns: LoadedColumn[],
  visible: LoadedColumn[],
  id: string | undefined,
  required: false,
): LoadedColumn | undefined
function mappedColumn(
  columns: LoadedColumn[],
  visible: LoadedColumn[],
  id: string | undefined,
  required: boolean,
) {
  if (!id) return undefined
  const column = columns.find((item) => item.id === id)
  if (!column) throw notFound()
  if (!visible.some((item) => item.id === id)) {
    if (required) throw notFound()
    return undefined
  }
  return column
}

function cellValues(columns: LoadedColumn[], cells: (typeof tableCells.$inferSelect)[]) {
  const values: Record<string, unknown> = {}
  for (const column of columns) {
    values[column.id] = readCell(
      column,
      cells.find((cell) => cell.columnId === column.id),
    )
  }
  return values
}

function configString(config: unknown, key: string) {
  if (!config || typeof config !== 'object') return undefined
  const value = (config as Record<string, unknown>)[key]
  return typeof value === 'string' && value ? value : undefined
}

function asNumber(value: unknown) {
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(number) ? number : 0
}
