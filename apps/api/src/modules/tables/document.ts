import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { tableColumns, tables } from '../../database/schema.js'
import { badRequest } from '../../errors.js'

const textTypes = new Set(['text', 'long_text', 'mail', 'url'])
const statusTypes = new Set(['select', 'radio', 'status'])
const numberTypes = new Set(['number', 'currency'])

export type QuoteDocument = {
  kind: 'quote'
  linesTableId: string
  quoteColumnId: string
  productColumnId: string
  quantityColumnId: string
  priceColumnId: string
  customerColumnId?: string
  statusColumnId?: string
}

type ColumnRow = { id: string; tableId: string; type: string; config: unknown }

/** Reads a stored quote mapping. A missing or incomplete mapping is not a quote. */
export function readQuoteDocument(value: unknown): QuoteDocument | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (record.kind !== 'quote') return null
  if (!isId(record.linesTableId) || !isId(record.quoteColumnId) || !isId(record.productColumnId))
    return null
  if (!isId(record.quantityColumnId) || !isId(record.priceColumnId)) return null
  return {
    kind: 'quote',
    linesTableId: record.linesTableId,
    quoteColumnId: record.quoteColumnId,
    productColumnId: record.productColumnId,
    quantityColumnId: record.quantityColumnId,
    priceColumnId: record.priceColumnId,
    ...(isId(record.customerColumnId) ? { customerColumnId: record.customerColumnId } : {}),
    ...(isId(record.statusColumnId) ? { statusColumnId: record.statusColumnId } : {}),
  }
}

/**
 * Checks a table update and returns the config to store. An empty object clears the setting.
 * Column ids are kept only when they still exist and have the type the quote layout needs.
 */
export async function documentConfigForSave(db: AppDatabase, tableId: string, value: unknown) {
  if (!value || typeof value !== 'object' || Object.keys(value as object).length === 0) return {}
  const record = value as Record<string, unknown>
  if (record.kind !== 'quote') throw badRequest('Unknown document')
  const [table] = await db.select().from(tables).where(eq(tables.id, tableId)).limit(1)
  if (!table) throw badRequest('Unknown table')
  const own = await columnsOf(db, tableId)
  const customer = optionalColumn(own, record.customerColumnId, textTypes, 'Customer')
  const status = optionalColumn(own, record.statusColumnId, statusTypes, 'Status')
  if (!isId(record.linesTableId)) throw badRequest('Choose the lines table')
  const [linesTable] = await db
    .select()
    .from(tables)
    .where(eq(tables.id, record.linesTableId))
    .limit(1)
  if (!linesTable || linesTable.projectId !== table.projectId)
    throw badRequest('Choose the lines table')
  const lines = await columnsOf(db, linesTable.id)
  const quote = requiredColumn(lines, record.quoteColumnId, new Set(['relation']), 'Quote')
  const quotedTableId = configString(quote.config, 'toTableId')
  if (quotedTableId !== table.id) throw badRequest('The quote column must link to this table')
  const product = requiredColumn(lines, record.productColumnId, new Set(['relation']), 'Product')
  requiredColumn(lines, record.quantityColumnId, new Set(['number']), 'Quantity')
  const priceId = record.priceColumnId
  const priceOnLine = lines.find((column) => column.id === priceId)
  if (priceOnLine) {
    if (!numberTypes.has(priceOnLine.type)) throw badRequest('Price must be a number')
  } else {
    const productTableId = configString(product.config, 'toTableId')
    const productColumns = productTableId ? await columnsOf(db, productTableId) : []
    const price = productColumns.find((column) => column.id === priceId)
    if (!price || !numberTypes.has(price.type)) throw badRequest('Price must be a number')
    const [productTable] = productTableId
      ? await db
          .select({ projectId: tables.projectId })
          .from(tables)
          .where(eq(tables.id, productTableId))
          .limit(1)
      : []
    if (!productTable || productTable.projectId !== table.projectId)
      throw badRequest('Price must be a number')
  }
  const saved: QuoteDocument = {
    kind: 'quote',
    linesTableId: linesTable.id,
    quoteColumnId: quote.id,
    productColumnId: product.id,
    quantityColumnId: String(record.quantityColumnId),
    priceColumnId: String(priceId),
    ...(customer ? { customerColumnId: customer.id } : {}),
    ...(status ? { statusColumnId: status.id } : {}),
  }
  return saved
}

/** Rewrites column and table ids to names so a project export can be imported elsewhere. */
export function exportDocumentConfig(
  value: unknown,
  names: {
    tableName: (id: string) => string | undefined
    columnName: (id: string) => { table: string; column: string } | undefined
  },
) {
  const quote = readQuoteDocument(value)
  if (!quote) return {}
  const columnRef = (id: string) => {
    const named = names.columnName(id)
    return named ? `${named.table}\0${named.column}` : undefined
  }
  const linesTable = names.tableName(quote.linesTableId)
  const quoteColumn = columnRef(quote.quoteColumnId)
  const productColumn = columnRef(quote.productColumnId)
  const quantityColumn = columnRef(quote.quantityColumnId)
  const priceColumn = columnRef(quote.priceColumnId)
  if (!linesTable || !quoteColumn || !productColumn || !quantityColumn || !priceColumn) return {}
  return {
    kind: 'quote',
    linesTable,
    quoteColumn,
    productColumn,
    quantityColumn,
    priceColumn,
    ...(quote.customerColumnId ? { customerColumn: columnRef(quote.customerColumnId) } : {}),
    ...(quote.statusColumnId ? { statusColumn: columnRef(quote.statusColumnId) } : {}),
  }
}

/** Turns an exported quote mapping back into column ids. An incomplete mapping is cleared. */
export function importDocumentConfig(
  value: unknown,
  ids: {
    tableId: (name: string) => string | undefined
    columnId: (table: string, column: string) => string | undefined
  },
) {
  if (!value || typeof value !== 'object') return {}
  const record = value as Record<string, unknown>
  if (record.kind !== 'quote') return {}
  const columnId = (ref: unknown) => {
    if (typeof ref !== 'string') return undefined
    const split = ref.indexOf('\0')
    if (split < 1) return undefined
    return ids.columnId(ref.slice(0, split), ref.slice(split + 1))
  }
  const linesTableId =
    typeof record.linesTable === 'string' ? ids.tableId(record.linesTable) : undefined
  const quoteColumnId = columnId(record.quoteColumn)
  const productColumnId = columnId(record.productColumn)
  const quantityColumnId = columnId(record.quantityColumn)
  const priceColumnId = columnId(record.priceColumn)
  if (!linesTableId || !quoteColumnId || !productColumnId || !quantityColumnId || !priceColumnId)
    return {}
  const customerColumnId = columnId(record.customerColumn)
  const statusColumnId = columnId(record.statusColumn)
  const saved: QuoteDocument = {
    kind: 'quote',
    linesTableId,
    quoteColumnId,
    productColumnId,
    quantityColumnId,
    priceColumnId,
    ...(customerColumnId ? { customerColumnId } : {}),
    ...(statusColumnId ? { statusColumnId } : {}),
  }
  return saved
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function configString(config: unknown, key: string) {
  if (!config || typeof config !== 'object') return undefined
  const value = (config as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

async function columnsOf(db: AppDatabase, tableId: string) {
  return db.select().from(tableColumns).where(eq(tableColumns.tableId, tableId))
}

function optionalColumn(columns: ColumnRow[], id: unknown, types: Set<string>, label: string) {
  if (!isId(id)) return undefined
  const column = columns.find((item) => item.id === id)
  if (!column || !types.has(column.type)) throw badRequest(`${label} has the wrong column type`)
  return column
}

function requiredColumn(columns: ColumnRow[], id: unknown, types: Set<string>, label: string) {
  if (!isId(id)) throw badRequest(`Choose the ${label.toLowerCase()} column`)
  const column = columns.find((item) => item.id === id)
  if (!column || !types.has(column.type)) throw badRequest(`${label} has the wrong column type`)
  return column
}
