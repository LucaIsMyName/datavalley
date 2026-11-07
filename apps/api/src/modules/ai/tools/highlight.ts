import { and, eq, inArray } from 'drizzle-orm'
import { projects, tableRows } from '../../../database/schema.js'
import { loadColumns, resolveTableContext } from '../../tables/service.js'
import { asRecord, asString } from './types.js'
import type { AiTool } from './types.js'

export const highlightTool: AiTool = {
  name: 'highlight',
  description: 'Point at cells, rows, or columns. This does not change the table or the page address.',
  parameters: {
    type: 'object',
    properties: {
      tableId: { type: 'string' },
      cells: {
        type: 'array',
        items: {
          type: 'object',
          properties: { rowId: { type: 'string' }, columnId: { type: 'string' } },
          required: ['rowId', 'columnId'],
        },
      },
      rowIds: { type: 'array', items: { type: 'string' } },
      columnIds: { type: 'array', items: { type: 'string' } },
    },
    required: ['tableId'],
    additionalProperties: false,
  },
  async run(host, args) {
    const { shell, physical } = await resolveTableContext(host.db, host.subject, asString(args.tableId), 'view')
    const columns = await loadColumns(host.db, physical.id)
    const columnIds = new Set(columns.map((column) => column.id))
    const requestedRows = [
      ...(Array.isArray(args.rowIds) ? args.rowIds.map(asString).filter(Boolean) : []),
      ...(Array.isArray(args.cells) ? args.cells.map((item) => asString(asRecord(item).rowId)).filter(Boolean) : []),
    ]
    const knownRows = new Set<string>()
    const uniqueRows = [...new Set(requestedRows)].slice(0, 50)
    if (uniqueRows.length > 0) {
      const rows = await host.db
        .select({ id: tableRows.id })
        .from(tableRows)
        .where(and(eq(tableRows.tableId, physical.id), inArray(tableRows.id, uniqueRows)))
      for (const row of rows) knownRows.add(row.id)
    }
    const cells = (Array.isArray(args.cells) ? args.cells : [])
      .map((item) => ({ rowId: asString(asRecord(item).rowId), columnId: asString(asRecord(item).columnId) }))
      .filter((item) => knownRows.has(item.rowId) && columnIds.has(item.columnId))
      .slice(0, 50)
    const rowIds = (Array.isArray(args.rowIds) ? args.rowIds : []).map(asString).filter((id) => knownRows.has(id)).slice(0, 50)
    const markedColumns = (Array.isArray(args.columnIds) ? args.columnIds : [])
      .map(asString)
      .filter((id) => columnIds.has(id))
      .slice(0, 30)
    const [project] = await host.db.select({ name: projects.name }).from(projects).where(eq(projects.id, shell.projectId)).limit(1)
    const highlight = {
      tableId: shell.id,
      projectId: shell.projectId,
      label: `${project?.name ?? ''} / ${shell.name}`.replace(/^ \/ /, ''),
      cells,
      rowIds,
      columnIds: markedColumns,
    }
    host.effects.highlights.push(highlight)
    return { ok: true, highlight }
  },
}
