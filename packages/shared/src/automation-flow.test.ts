import { describe, expect, it } from 'vitest'
import {
  builtinStageRule,
  columnWritable,
  conditionMatches,
  copyFits,
  effectiveFlows,
  operatorsFor,
  switchBranch,
  validateFlow,
  type AutomationCatalogTable,
  type AutomationFlow,
  type CustomAutomationRule,
} from './automations.js'

const custom: CustomAutomationRule = {
  id: '11111111-1111-4111-8111-111111111111',
  builtin: false,
  enabled: true,
  sourceTableId: 'deals',
  sourceColumnId: 'stage',
  action: 'create',
  targetTableId: 'tasks',
  linkColumnId: null,
  cells: [{ columnId: 'name', template: 'Call: {{label}}' }],
}

const tables: AutomationCatalogTable[] = [
  {
    id: 'deals',
    name: 'Deals',
    columns: [
      { id: 'stage', name: 'Stage', type: 'select', toTableId: null, choices: [{ id: 'proposal', label: 'Proposal' }, { id: 'won', label: 'Won' }] },
      { id: 'health', name: 'Health', type: 'status', toTableId: null, choices: [{ id: 'open', label: 'Open' }] },
      { id: 'paid', name: 'Paid', type: 'checkbox', toTableId: null, choices: [] },
      { id: 'amount', name: 'Amount', type: 'number', toTableId: null, choices: [] },
      { id: 'total', name: 'Total', type: 'formula', toTableId: null, choices: [] },
    ],
  },
  {
    id: 'tasks',
    name: 'Tasks',
    columns: [
      { id: 'name', name: 'Name', type: 'text', toTableId: null, choices: [] },
      { id: 'done', name: 'Done', type: 'checkbox', toTableId: null, choices: [] },
      { id: 'deal', name: 'Deal', type: 'relation', toTableId: 'deals', choices: [] },
      { id: 'other', name: 'Other', type: 'relation', toTableId: 'people', choices: [] },
    ],
  },
]

function flow(partial: Partial<AutomationFlow> & Pick<AutomationFlow, 'nodes' | 'edges'>): AutomationFlow {
  return { id: '33333333-3333-4333-8333-333333333333', name: 'Flow', enabled: true, ...partial }
}

describe('automation flows', () => {
  it('describes operators and writes from the column type', () => {
    expect(operatorsFor('checkbox')).toEqual(['is_true', 'is_false', 'changed_true', 'changed_false'])
    expect(operatorsFor('status')).toContain('is')
    expect(operatorsFor('select')).toContain('any_of')
    expect(columnWritable('formula')).toBe(false)
    expect(columnWritable('row_id')).toBe(false)
    expect(columnWritable('media')).toBe(false)
    expect(copyFits('checkbox', 'number')).toBe(false)
    expect(copyFits('text', 'number')).toBe(true)
  })

  it('matches a checkbox and one switch path', () => {
    expect(conditionMatches('is_true', 'checkbox', null, false, true)).toBe(false)
    expect(conditionMatches('is_true', 'checkbox', null, true, false)).toBe(true)
    expect(conditionMatches('changed_false', 'checkbox', null, false, true)).toBe(true)
    expect(switchBranch([{ id: 'open', optionIds: ['open'] }, { id: 'won', optionIds: ['won'] }], 'won')).toBe('won')
    expect(switchBranch([{ id: 'open', optionIds: ['open'] }], 'other')).toBe('else')
  })

  it('reads an old rule as a two-node flow and prefers a stored flow', () => {
    const converted = effectiveFlows({ automations: { rules: [builtinStageRule(false), custom] } })
    expect(converted.map((item) => item.nodes.map((node) => node.type))).toEqual([['trigger', 'action']])
    const stored = converted[0]
    stored.name = 'Stored'
    expect(effectiveFlows({ automations: { rules: [custom], flows: [stored] } })[0].name).toBe('Stored')
    expect(effectiveFlows({ automations: { rules: [custom], flows: [] } }).map((item) => item.id)).toEqual([custom.id])
  })

  it('rejects a number written into a checkbox, a bad relation, a deleted-row edit, and a cycle', () => {
    const mismatch = flow({
      nodes: [
        { id: 'start', type: 'trigger', tableId: 'deals', event: 'column_changed', columnId: 'paid', position: { x: 0, y: 0 } },
        {
          id: 'make',
          type: 'action',
          action: 'create',
          tableId: 'tasks',
          linkColumnId: null,
          fields: [{ columnId: 'done', value: { kind: 'literal', value: 1 } }],
          position: { x: 0, y: 0 },
        },
      ],
      edges: [{ id: 'wire', source: 'start', target: 'make', when: null }],
    })
    expect(validateFlow(mismatch, tables).some((issue) => issue.code === 'type_mismatch')).toBe(true)

    const relation = flow({
      nodes: [
        { id: 'start', type: 'trigger', tableId: 'deals', event: 'column_changed', columnId: 'stage', position: { x: 0, y: 0 } },
        {
          id: 'make',
          type: 'action',
          action: 'update_linked',
          tableId: 'tasks',
          linkColumnId: 'other',
          fields: [{ columnId: 'name', value: { kind: 'literal', value: 'Hi' } }],
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    })
    expect(validateFlow(relation, tables).some((issue) => issue.code === 'wrong_relation')).toBe(true)

    const deleted = flow({
      nodes: [
        { id: 'start', type: 'trigger', tableId: 'deals', event: 'row_deleted', columnId: null, position: { x: 0, y: 0 } },
        {
          id: 'make',
          type: 'action',
          action: 'update_source',
          tableId: 'deals',
          linkColumnId: null,
          fields: [{ columnId: 'amount', value: { kind: 'literal', value: 1 } }],
          position: { x: 0, y: 0 },
        },
      ],
      edges: [],
    })
    expect(validateFlow(deleted, tables).some((issue) => issue.code === 'updates_deleted')).toBe(true)

    const loop = flow({
      nodes: [
        { id: 'start', type: 'trigger', tableId: 'deals', event: 'row_created', columnId: null, position: { x: 0, y: 0 } },
        {
          id: 'make',
          type: 'action',
          action: 'create',
          tableId: 'tasks',
          linkColumnId: null,
          fields: [],
          position: { x: 0, y: 0 },
        },
      ],
      edges: [
        { id: 'out', source: 'start', target: 'make', when: null },
        { id: 'back', source: 'make', target: 'make', when: null },
      ],
    })
    expect(validateFlow(loop, tables).some((issue) => issue.code === 'cycle')).toBe(true)
    expect(validateFlow(loop, tables).some((issue) => issue.nodeId === 'make' && issue.code === 'not_writable')).toBe(false)
  })
})
