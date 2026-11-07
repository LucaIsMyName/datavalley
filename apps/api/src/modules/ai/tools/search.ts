import { search } from '../../search/service.js'
import { asString } from './types.js'
import type { AiTool } from './types.js'

export const searchTool: AiTool = {
  name: 'search',
  description: 'Search projects, tables, columns, and rows the signed-in user can view.',
  parameters: {
    type: 'object',
    properties: { q: { type: 'string' } },
    required: ['q'],
    additionalProperties: false,
  },
  async run(host, args) {
    const results = await search(host.db, host.subject, { q: asString(args.q), locale: host.subject.user?.locale })
    const take = (items: { title: string; href: string; subtitle: string | null }[]) =>
      items.slice(0, 8).map((item) => ({ title: item.title, subtitle: item.subtitle, href: item.href }))
    return {
      projects: take(results.projects),
      tables: take(results.tables),
      columns: take(results.columns),
      rows: take(results.rows),
    }
  },
}
