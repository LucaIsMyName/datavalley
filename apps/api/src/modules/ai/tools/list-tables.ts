import { listTables } from '../../tables/service.js'
import { asString } from './types.js'
import type { AiTool } from './types.js'

export const listTablesTool: AiTool = {
  name: 'list_tables',
  description: 'List tables in a project the signed-in user can view.',
  parameters: {
    type: 'object',
    properties: { projectId: { type: 'string' } },
    required: ['projectId'],
    additionalProperties: false,
  },
  async run(host, args) {
    const projectId = asString(args.projectId)
    const tables = await listTables(host.db, host.subject, projectId)
    return { tables: tables.slice(0, 40).map((table) => ({ id: table.id, name: table.name })) }
  },
}
