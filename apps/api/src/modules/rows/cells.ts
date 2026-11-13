import { and, eq } from 'drizzle-orm'
import type { CellWrite } from '../../column-types/index.js'
import type { AppDatabase } from '../../database/client.js'
import { tableCells } from '../../database/schema.js'

/**
 * `upsert` keeps the cell row, so an ordinary edit does not change its id.
 * `replace` deletes that row and inserts a new one. Connector sync and select-option
 * rewrites depend on the delete: a value that does not parse must leave no cell behind.
 */
export type CellPersistMode = 'upsert' | 'replace'

export async function persistCell(
  db: AppDatabase,
  input: {
    tableId: string
    rowId: string
    columnId: string
    parsed: CellWrite | null
    background: string | null
    formatRules: unknown
    mode: CellPersistMode
  },
) {
  const record = {
    tableId: input.tableId,
    rowId: input.rowId,
    columnId: input.columnId,
    valueText: input.parsed?.valueText ?? null,
    valueNumber: input.parsed?.valueNumber ?? null,
    valueBool: input.parsed?.valueBool ?? null,
    valueTimestamptz: input.parsed?.valueTimestamptz ?? null,
    valueJsonb: (input.parsed?.valueJsonb ?? null) as never,
    background: input.background,
    formatRules: input.formatRules as never,
  }
  if (input.mode === 'replace') {
    await db
      .delete(tableCells)
      .where(and(eq(tableCells.rowId, input.rowId), eq(tableCells.columnId, input.columnId)))
    await db.insert(tableCells).values(record)
    return
  }
  const updatedAt = new Date()
  await db
    .insert(tableCells)
    .values({ ...record, updatedAt })
    .onConflictDoUpdate({
      target: [tableCells.rowId, tableCells.columnId],
      set: {
        valueText: record.valueText,
        valueNumber: record.valueNumber,
        valueBool: record.valueBool,
        valueTimestamptz: record.valueTimestamptz,
        valueJsonb: record.valueJsonb,
        background: record.background,
        formatRules: record.formatRules,
        updatedAt,
      },
    })
}
