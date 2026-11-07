import { listProjects } from '../../projects/service.js'
import type { AiTool } from './types.js'

export const listProjectsTool: AiTool = {
  name: 'list_projects',
  description: 'List projects the signed-in user can view.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  async run(host) {
    const projects = await listProjects(host.db, host.subject, false)
    return { projects: projects.slice(0, 30).map((project) => ({ id: project.id, name: project.name })) }
  },
}
