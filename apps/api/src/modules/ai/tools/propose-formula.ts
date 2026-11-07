import { previewFormula } from '../../formulas/service.js'
import { requireTable } from '../../tables/service.js'
import { asString } from './types.js'
import type { AiTool } from './types.js'

function previewText(value: unknown) {
  if (value && typeof value === 'object' && 'error' in value) return String((value as { error: unknown }).error)
  if (typeof value === 'string') return value
  if (value == null) return ''
  return JSON.stringify(value)
}

export const proposeFormulaTool: AiTool = {
  name: 'propose_formula',
  description: 'Check a bracket-form formula and return it for the user. This does not save the formula.',
  parameters: {
    type: 'object',
    properties: {
      tableId: { type: 'string' },
      expression: { type: 'string' },
      columnId: { type: 'string' },
      rowId: { type: 'string' },
    },
    required: ['tableId', 'expression'],
    additionalProperties: false,
  },
  async run(host, args) {
    const tableId = asString(args.tableId)
    const expression = asString(args.expression)
    const rowId = asString(args.rowId) || undefined
    const columnId = asString(args.columnId) || undefined
    const table = await requireTable(host.db, host.subject, tableId, 'view')
    const preview = await previewFormula(host.db, host.subject, table.id, expression, rowId)
    const proposal = {
      kind: 'formula' as const,
      tableId: table.id,
      projectId: table.projectId,
      expression,
      preview: previewText(preview.value),
      columnId,
      rowId,
    }
    host.effects.proposals.push(proposal)
    return { ok: true, expression, preview: proposal.preview }
  },
}
