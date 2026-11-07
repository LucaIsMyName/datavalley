import { listRows, visibleColumns } from '../../rows/service.js'
import { loadColumns, resolveTableContext } from '../../tables/service.js'
import { asString, clip } from './types.js'
import type { AiTool } from './types.js'

export const sampleRowsTool: AiTool = {
  name: 'sample_rows',
  description: 'Read up to 20 rows from a table the signed-in user can view. This does not change data.',
  parameters: {
    type: 'object',
    properties: { tableId: { type: 'string' }, limit: { type: 'number' } },
    required: ['tableId'],
    additionalProperties: false,
  },
  async run(host, args) {
    const tableId = asString(args.tableId)
    const requested = typeof args.limit === 'number' ? args.limit : 20
    const limit = Math.max(1, Math.min(20, Math.floor(requested)))
    const { shell, physical } = await resolveTableContext(host.db, host.subject, tableId, 'view')
    const loaded = await loadColumns(host.db, physical.id)
    const columns = (await visibleColumns(host.db, host.subject, physical.id, shell.projectId, loaded)).slice(0, 12)
    const page = await listRows(host.db, host.subject, shell.id, { limit })
    return {
      tableId: shell.id,
      rows: page.rows.slice(0, limit).map((row) => ({
        id: row.id,
        rowNumber: row.rowNumber,
        version: row.version,
        cells: columns.map((column) => ({
          columnId: column.id,
          name: column.name,
          value: clip(row.cells[column.id] == null ? '' : String(row.cells[column.id]), 120),
        })),
      })),
    }
  },
}
