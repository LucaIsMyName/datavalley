import { badRequest } from '../../../errors.js'
import { assertCan } from '../../../security/access.js'
import { requireTable } from '../../tables/service.js'
import { asString, type AiTool } from './types.js'

export const navigateTool: AiTool = {
  name: 'navigate',
  description: 'Open a project or table the signed-in user can view. Use this when the answer is on a page they are not already viewing.',
  parameters: {
    type: 'object',
    properties: { projectId: { type: 'string' }, tableId: { type: 'string' } },
    additionalProperties: false,
  },
  async run(host, args) {
    const tableId = asString(args.tableId)
    const projectId = asString(args.projectId)
    if (tableId) {
      const table = await requireTable(host.db, host.subject, tableId, 'view')
      const path = `/projects/${table.projectId}/tables/${table.id}`
      host.effects.navigation = { path }
      return { ok: true, path }
    }
    if (projectId) {
      await assertCan(host.db, host.subject, 'view', { type: 'project', id: projectId })
      const path = `/projects/${projectId}`
      host.effects.navigation = { path }
      return { ok: true, path }
    }
    throw badRequest('A project or table is required')
  },
}
