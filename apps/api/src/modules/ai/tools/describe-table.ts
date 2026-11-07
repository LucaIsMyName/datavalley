import { visibleColumns } from '../../rows/service.js'
import { loadColumns, resolveTableContext } from '../../tables/service.js'
import { asString } from './types.js'
import type { AiTool } from './types.js'

export const describeTableTool: AiTool = {
  name: 'describe_table',
  description: 'List the columns of a table the signed-in user can view.',
  parameters: {
    type: 'object',
    properties: { tableId: { type: 'string' } },
    required: ['tableId'],
    additionalProperties: false,
  },
  async run(host, args) {
    const { shell, physical } = await resolveTableContext(host.db, host.subject, asString(args.tableId), 'view')
    const loaded = await loadColumns(host.db, physical.id)
    const columns = await visibleColumns(host.db, host.subject, physical.id, shell.projectId, loaded)
    return {
      tableId: shell.id,
      name: shell.name,
      projectId: shell.projectId,
      columns: columns.slice(0, 30).map((column) => ({ id: column.id, name: column.name, type: column.type })),
    }
  },
}
