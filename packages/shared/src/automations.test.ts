import { describe, expect, it } from 'vitest'
import {
  builtinStageRule,
  effectiveAutomationRules,
  fillAutomationTemplate,
  withBuiltin,
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

describe('automation rules', () => {
  it('runs nothing until a project stores its own rules', () => {
    expect(effectiveAutomationRules({})).toEqual([])
    expect(effectiveAutomationRules({ automations: { rules: [] } })).toEqual([])
    expect(
      effectiveAutomationRules({
        automations: { rules: [{ id: 'stage-follow-up', builtin: true, enabled: false }] },
      }),
    ).toEqual([builtinStageRule(false)])
  })

  it('puts the built-in rule first and drops a duplicate custom id', () => {
    expect(withBuiltin([custom, custom, builtinStageRule(false)])).toEqual([builtinStageRule(false), custom])
  })

  it('fills the template tokens', () => {
    expect(fillAutomationTemplate('Call: {{label}} on {{today}} {{row}}', {
      label: 'Proposal',
      value: 'id',
      today: '2026-11-08',
      row: 'row-1',
    })).toBe('Call: Proposal on 2026-11-08 row-1')
  })
})
