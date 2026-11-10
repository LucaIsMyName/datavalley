import { and, eq, inArray } from 'drizzle-orm'
import type { AiCellChange } from '@datavalley/shared'
import { readCell } from '../../../column-types/index.js'
import { tableCells, tableRows } from '../../../database/schema.js'
import { badRequest } from '../../../errors.js'
import { allows, resolveGrants } from '../../../security/access.js'
import { visibleColumns } from '../../rows/visible-columns.js'
import { loadColumns, resolveTableContext } from '../../tables/service.js'
import { asRecord, asString, plainValue } from './types.js'
import type { AiTool } from './types.js'

export const proposeChangesTool: AiTool = {
  name: 'propose_changes',
  description: 'Propose cell edits for the user to confirm. This does not save anything.',
  parameters: {
    type: 'object',
    properties: {
      tableId: { type: 'string' },
      changes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            rowId: { type: 'string' },
            columnId: { type: 'string' },
            value: {},
          },
          required: ['rowId', 'columnId', 'value'],
        },
      },
    },
    required: ['tableId', 'changes'],
    additionalProperties: false,
  },
  async run(host, args) {
    const { shell, physical } = await resolveTableContext(host.db, host.subject, asString(args.tableId), 'view')
    const columns = await visibleColumns(
      host.db,
      host.subject,
      shell.id,
      shell.projectId,
      await loadColumns(host.db, physical.id),
    )
    const columnById = new Map(columns.map((column) => [column.id, column]))
    const grants = await resolveGrants(host.db, host.subject)
    const requested = (Array.isArray(args.changes) ? args.changes : []).slice(0, 100).map((item) => asRecord(item))
    const rowIds = [...new Set(requested.map((item) => asString(item.rowId)).filter(Boolean))]
    const rows = rowIds.length
      ? await host.db
          .select()
          .from(tableRows)
          .where(and(eq(tableRows.tableId, physical.id), inArray(tableRows.id, rowIds)))
      : []
    const rowById = new Map(rows.map((row) => [row.id, row]))
    const cells = rowIds.length
      ? await host.db.select().from(tableCells).where(inArray(tableCells.rowId, rowIds))
      : []
    const cellByKey = new Map(cells.map((cell) => [`${cell.rowId}:${cell.columnId}`, cell]))
    const changes: AiCellChange[] = []
    for (const item of requested) {
      const rowId = asString(item.rowId)
      const columnId = asString(item.columnId)
      const row = rowById.get(rowId)
      const column = columnById.get(columnId)
      if (!row || !column || !plainValue(item.value)) continue
      if (
        !allows(host.subject, grants, 'view', {
          type: 'row',
          id: row.id,
          parents: { table: shell.id, project: shell.projectId },
        })
      ) {
        continue
      }
      if (column.type === 'formula' || column.type === 'lookup' || column.type === 'row_id') continue
      const existing = cellByKey.get(`${rowId}:${columnId}`)
      changes.push({
        rowId,
        columnId,
        value: item.value,
        version: row.version,
        rowLabel: `#${row.rowNumber}`,
        columnName: column.name,
        before: readCell(column, existing ?? undefined),
      })
    }
    if (changes.length === 0) throw badRequest('No valid cells to propose')
    const proposal = { kind: 'cells' as const, tableId: shell.id, projectId: shell.projectId, changes }
    host.effects.proposals.push(proposal)
    return { ok: true, count: changes.length, proposal }
  },
}
