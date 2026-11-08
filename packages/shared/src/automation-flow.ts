import type { CustomAutomationRule } from './automations.js'

export const MAX_AUTOMATION_FLOWS = 20
export const MAX_AUTOMATION_NODES = 40

export const SWITCH_COLUMN_TYPES = ['select', 'radio', 'status', 'tags', 'multi_select'] as const

const TEXT_TYPES = new Set(['text', 'long_text', 'mail', 'url'])
const NUMBER_TYPES = new Set(['number', 'currency'])
const DATE_TYPES = new Set(['date', 'datetime'])
const CHOICE_TYPES = new Set(['select', 'radio', 'status'])
const TAG_TYPES = new Set(['tags', 'multi_select'])
const READONLY_TYPES = new Set(['formula', 'lookup', 'row_id', 'media'])
const VALUE_OPS = new Set(['eq', 'contains', 'starts_with', 'gt', 'lt', 'before', 'after', 'is', 'is_not', 'any_of', 'contains_any'])

export type FlowTriggerEvent = 'row_created' | 'column_changed' | 'row_deleted'
export type FlowActionKind = 'create' | 'update_source' | 'update_linked' | 'update_created'
export type FieldValueKind = 'literal' | 'column' | 'template' | 'empty'

export type FieldValue =
  | { kind: 'literal'; value: unknown }
  | { kind: 'column'; columnId: string }
  | { kind: 'template'; template: string }
  | { kind: 'empty' }

export type FlowField = { columnId: string; value: FieldValue }

export type FlowTriggerNode = {
  id: string
  type: 'trigger'
  tableId: string
  event: FlowTriggerEvent
  columnId: string | null
  position: { x: number; y: number }
}

export type FlowConditionNode = {
  id: string
  type: 'condition'
  columnId: string
  op: string
  value: unknown
  position: { x: number; y: number }
}

export type FlowSwitchCase = { id: string; optionIds: string[] }

export type FlowSwitchNode = {
  id: string
  type: 'switch'
  columnId: string
  cases: FlowSwitchCase[]
  position: { x: number; y: number }
}

export type FlowActionNode = {
  id: string
  type: 'action'
  action: FlowActionKind
  tableId: string
  linkColumnId: string | null
  fields: FlowField[]
  position: { x: number; y: number }
}

export type FlowNode = FlowTriggerNode | FlowConditionNode | FlowSwitchNode | FlowActionNode

export type FlowEdge = {
  id: string
  source: string
  target: string
  when: string | null
}

export type AutomationFlow = {
  id: string
  name: string
  enabled: boolean
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export type AutomationChoice = { id: string; label: string }

export type AutomationCatalogColumn = {
  id: string
  name: string
  type: string
  toTableId: string | null
  choices: AutomationChoice[]
}

export type AutomationCatalogTable = {
  id: string
  name: string
  columns: AutomationCatalogColumn[]
}

export type FlowIssueCode =
  | 'missing_trigger'
  | 'extra_trigger'
  | 'missing_table'
  | 'missing_column'
  | 'illegal_operator'
  | 'unknown_choice'
  | 'not_writable'
  | 'type_mismatch'
  | 'wrong_relation'
  | 'meaningless_wire'
  | 'cycle'
  | 'updates_deleted'
  | 'switch_type'
  | 'missing_value'
  | 'empty_switch'

export type FlowIssue = { nodeId: string; code: FlowIssueCode }

export function operatorsFor(type: string) {
  if (TEXT_TYPES.has(type)) return ['empty', 'not_empty', 'eq', 'contains', 'starts_with']
  if (NUMBER_TYPES.has(type)) return ['empty', 'not_empty', 'eq', 'gt', 'lt']
  if (DATE_TYPES.has(type)) return ['empty', 'not_empty', 'today', 'before', 'after']
  if (type === 'checkbox') return ['is_true', 'is_false', 'changed_true', 'changed_false']
  if (CHOICE_TYPES.has(type)) return ['is', 'is_not', 'any_of', 'empty', 'not_empty']
  if (TAG_TYPES.has(type)) return ['empty', 'not_empty', 'contains_any']
  if (type === 'user') return ['empty', 'not_empty', 'is']
  if (type === 'relation') return ['empty', 'not_empty', 'linked']
  return ['empty', 'not_empty']
}

export function columnWritable(type: string) {
  return !READONLY_TYPES.has(type)
}

export function valueKindsFor(type: string): FieldValueKind[] {
  if (!columnWritable(type)) return []
  if (TEXT_TYPES.has(type) || type === 'relation') return ['literal', 'column', 'template', 'empty']
  return ['literal', 'column', 'empty']
}

export function opNeedsValue(op: string) {
  return VALUE_OPS.has(op)
}

export function copyFits(targetType: string, sourceType: string) {
  if (!columnWritable(targetType)) return false
  if (TEXT_TYPES.has(targetType)) return true
  if (targetType === 'checkbox') return sourceType === 'checkbox'
  if (NUMBER_TYPES.has(targetType)) return NUMBER_TYPES.has(sourceType)
  if (DATE_TYPES.has(targetType)) return sourceType === targetType || sourceType === 'date'
  if (CHOICE_TYPES.has(targetType)) return sourceType === targetType || (CHOICE_TYPES.has(sourceType) && targetType !== 'status' && sourceType !== 'status')
  if (TAG_TYPES.has(targetType)) return sourceType === targetType
  if (targetType === 'user') return sourceType === 'user'
  if (targetType === 'relation') return sourceType === 'relation' || sourceType === 'row_id'
  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parsePosition(value: unknown) {
  if (!isRecord(value)) return { x: 0, y: 0 }
  return {
    x: typeof value.x === 'number' && Number.isFinite(value.x) ? value.x : 0,
    y: typeof value.y === 'number' && Number.isFinite(value.y) ? value.y : 0,
  }
}

function parseFieldValue(value: unknown): FieldValue | null {
  if (!isRecord(value)) return null
  if (value.kind === 'empty') return { kind: 'empty' }
  if (value.kind === 'literal') return { kind: 'literal', value: value.value }
  if (value.kind === 'column' && typeof value.columnId === 'string' && value.columnId) {
    return { kind: 'column', columnId: value.columnId }
  }
  if (value.kind === 'template' && typeof value.template === 'string' && value.template.length <= 200) {
    return { kind: 'template', template: value.template }
  }
  return null
}

function parseNode(value: unknown): FlowNode | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) return null
  const position = parsePosition(value.position)
  if (value.type === 'trigger') {
    if (value.event !== 'row_created' && value.event !== 'column_changed' && value.event !== 'row_deleted') return null
    if (typeof value.tableId !== 'string' || !value.tableId) return null
    if (value.columnId != null && typeof value.columnId !== 'string') return null
    return {
      id: value.id,
      type: 'trigger',
      tableId: value.tableId,
      event: value.event,
      columnId: typeof value.columnId === 'string' ? value.columnId : null,
      position,
    }
  }
  if (value.type === 'condition') {
    if (typeof value.columnId !== 'string' || typeof value.op !== 'string') return null
    return { id: value.id, type: 'condition', columnId: value.columnId, op: value.op, value: value.value ?? null, position }
  }
  if (value.type === 'switch') {
    if (typeof value.columnId !== 'string' || !Array.isArray(value.cases)) return null
    const cases: FlowSwitchCase[] = []
    for (const item of value.cases) {
      if (!isRecord(item) || typeof item.id !== 'string' || !item.id || !Array.isArray(item.optionIds)) return null
      if (item.optionIds.some((id) => typeof id !== 'string')) return null
      cases.push({ id: item.id, optionIds: item.optionIds as string[] })
    }
    return { id: value.id, type: 'switch', columnId: value.columnId, cases, position }
  }
  if (value.type === 'action') {
    if (
      value.action !== 'create' &&
      value.action !== 'update_source' &&
      value.action !== 'update_linked' &&
      value.action !== 'update_created'
    ) {
      return null
    }
    if (typeof value.tableId !== 'string' || !Array.isArray(value.fields)) return null
    if (value.linkColumnId != null && typeof value.linkColumnId !== 'string') return null
    const fields: FlowField[] = []
    for (const field of value.fields) {
      if (!isRecord(field) || typeof field.columnId !== 'string') return null
      const parsed = parseFieldValue(field.value)
      if (!parsed) return null
      fields.push({ columnId: field.columnId, value: parsed })
    }
    return {
      id: value.id,
      type: 'action',
      action: value.action,
      tableId: value.tableId,
      linkColumnId: typeof value.linkColumnId === 'string' ? value.linkColumnId : null,
      fields,
      position,
    }
  }
  return null
}

export function parseAutomationFlow(value: unknown): AutomationFlow | null {
  if (!isRecord(value) || typeof value.id !== 'string' || value.id.length < 8) return null
  if (typeof value.name !== 'string' || value.name.length > 80) return null
  if (!Array.isArray(value.nodes) || value.nodes.length > MAX_AUTOMATION_NODES) return null
  if (!Array.isArray(value.edges) || value.edges.length > MAX_AUTOMATION_NODES * 2) return null
  const nodes = value.nodes.map(parseNode)
  if (nodes.some((node) => !node)) return null
  const parsed = nodes as FlowNode[]
  if (new Set(parsed.map((node) => node.id)).size !== parsed.length) return null
  const edges: FlowEdge[] = []
  for (const edge of value.edges) {
    if (!isRecord(edge) || typeof edge.id !== 'string' || typeof edge.source !== 'string' || typeof edge.target !== 'string') {
      return null
    }
    if (edge.when != null && typeof edge.when !== 'string') return null
    edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      when: typeof edge.when === 'string' ? edge.when : null,
    })
  }
  if (new Set(edges.map((edge) => edge.id)).size !== edges.length) return null
  return { id: value.id, name: value.name, enabled: value.enabled === true, nodes: parsed, edges }
}

export function flowFromRule(rule: CustomAutomationRule): AutomationFlow {
  const triggerId = `${rule.id}:trigger`
  const actionId = `${rule.id}:action`
  return {
    id: rule.id,
    name: 'Automation',
    enabled: rule.enabled,
    nodes: [
      {
        id: triggerId,
        type: 'trigger',
        tableId: rule.sourceTableId,
        event: 'column_changed',
        columnId: rule.sourceColumnId,
        position: { x: 0, y: 0 },
      },
      {
        id: actionId,
        type: 'action',
        action: rule.action === 'update' ? 'update_linked' : 'create',
        tableId: rule.targetTableId,
        linkColumnId: rule.linkColumnId,
        fields: rule.cells.map((cell) => ({ columnId: cell.columnId, value: { kind: 'template', template: cell.template } })),
        position: { x: 320, y: 0 },
      },
    ],
    edges: [{ id: `${rule.id}:wire`, source: triggerId, target: actionId, when: null }],
  }
}

export function flowsFromSettings(settings: unknown): AutomationFlow[] | null {
  if (!isRecord(settings) || !isRecord(settings.automations) || !('flows' in settings.automations)) return null
  if (!Array.isArray(settings.automations.flows)) return null
  return settings.automations.flows
    .map(parseAutomationFlow)
    .filter((flow): flow is AutomationFlow => Boolean(flow))
    .slice(0, MAX_AUTOMATION_FLOWS)
}

function tableById(tables: AutomationCatalogTable[], id: string) {
  return tables.find((table) => table.id === id)
}

function columnById(table: AutomationCatalogTable | undefined, id: string | null) {
  if (!table || !id) return undefined
  return table.columns.find((column) => column.id === id)
}

function choiceIds(column: AutomationCatalogColumn | undefined) {
  return new Set((column?.choices ?? []).map((choice) => choice.id))
}

function literalFits(type: string, value: unknown, choices: Set<string>) {
  if (type === 'checkbox') return typeof value === 'boolean'
  if (NUMBER_TYPES.has(type)) return typeof value === 'number' && Number.isFinite(value)
  if (TEXT_TYPES.has(type) || DATE_TYPES.has(type) || type === 'relation') return typeof value === 'string'
  if (type === 'user') return typeof value === 'string' && value.length > 0
  if (CHOICE_TYPES.has(type)) return typeof value === 'string' && choices.has(value)
  if (TAG_TYPES.has(type)) return Array.isArray(value) && value.every((item) => typeof item === 'string' && choices.has(item))
  return false
}

function conditionValueFits(column: AutomationCatalogColumn, op: string, value: unknown) {
  if (!opNeedsValue(op)) return null
  if (op === 'any_of' || op === 'contains_any') {
    if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string')) return 'missing_value' as const
    const choices = choiceIds(column)
    if (value.some((item) => !choices.has(item))) return 'unknown_choice' as const
    return null
  }
  if (CHOICE_TYPES.has(column.type) || TAG_TYPES.has(column.type)) {
    if (typeof value !== 'string' || !value) return 'missing_value' as const
    if (!choiceIds(column).has(value)) return 'unknown_choice' as const
    return null
  }
  if (NUMBER_TYPES.has(column.type)) {
    return typeof value === 'number' && Number.isFinite(value) ? null : ('missing_value' as const)
  }
  if (typeof value !== 'string' || !value.trim()) return 'missing_value' as const
  return null
}

function hasCycle(nodes: FlowNode[], edges: FlowEdge[]) {
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    const list = outgoing.get(edge.source) ?? []
    list.push(edge.target)
    outgoing.set(edge.source, list)
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  function walk(id: string): boolean {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    for (const next of outgoing.get(id) ?? []) {
      if (walk(next)) return true
    }
    visiting.delete(id)
    visited.add(id)
    return false
  }
  return nodes.some((node) => walk(node.id))
}

export function validateFlow(flow: AutomationFlow, tables: AutomationCatalogTable[]): FlowIssue[] {
  const issues: FlowIssue[] = []
  const triggers = flow.nodes.filter((node): node is FlowTriggerNode => node.type === 'trigger')
  const trigger = triggers[0]
  if (!trigger) issues.push({ nodeId: flow.nodes[0]?.id ?? flow.id, code: 'missing_trigger' })
  for (const extra of triggers.slice(1)) issues.push({ nodeId: extra.id, code: 'extra_trigger' })
  const triggerTable = trigger ? tableById(tables, trigger.tableId) : undefined
  if (trigger && !triggerTable) issues.push({ nodeId: trigger.id, code: 'missing_table' })
  if (trigger?.event === 'column_changed') {
    const column = columnById(triggerTable, trigger.columnId)
    if (!column) issues.push({ nodeId: trigger.id, code: 'missing_column' })
  }
  const byId = new Map(flow.nodes.map((node) => [node.id, node]))
  for (const node of flow.nodes) {
    if (node.type === 'condition' || node.type === 'switch') {
      const column = columnById(triggerTable, node.columnId)
      if (!column) {
        issues.push({ nodeId: node.id, code: 'missing_column' })
        continue
      }
      if (node.type === 'switch') {
        if (!SWITCH_COLUMN_TYPES.includes(column.type as (typeof SWITCH_COLUMN_TYPES)[number])) {
          issues.push({ nodeId: node.id, code: 'switch_type' })
          continue
        }
        if (node.cases.length === 0) issues.push({ nodeId: node.id, code: 'empty_switch' })
        const choices = choiceIds(column)
        for (const item of node.cases) {
          if (item.optionIds.length === 0) issues.push({ nodeId: node.id, code: 'missing_value' })
          else if (item.optionIds.some((id) => !choices.has(id))) issues.push({ nodeId: node.id, code: 'unknown_choice' })
        }
        continue
      }
      if (!operatorsFor(column.type).includes(node.op)) {
        issues.push({ nodeId: node.id, code: 'illegal_operator' })
        continue
      }
      const valueIssue = conditionValueFits(column, node.op, node.value)
      if (valueIssue) issues.push({ nodeId: node.id, code: valueIssue })
    }
    if (node.type !== 'action') continue
    if (node.action === 'update_source' && trigger?.event === 'row_deleted') {
      issues.push({ nodeId: node.id, code: 'updates_deleted' })
    }
    const target =
      node.action === 'update_source' ? triggerTable : tableById(tables, node.tableId)
    if (!target) {
      issues.push({ nodeId: node.id, code: 'missing_table' })
      continue
    }
    if (node.action === 'update_source' && node.tableId !== trigger?.tableId) {
      issues.push({ nodeId: node.id, code: 'missing_table' })
    }
    if (node.action === 'update_linked') {
      const link = columnById(target, node.linkColumnId)
      if (!link || link.type !== 'relation' || link.toTableId !== trigger?.tableId) {
        issues.push({ nodeId: node.id, code: 'wrong_relation' })
      }
    }
    for (const field of node.fields) {
      const column = target.columns.find((item) => item.id === field.columnId)
      if (!column) {
        issues.push({ nodeId: node.id, code: 'missing_column' })
        continue
      }
      if (!columnWritable(column.type)) {
        issues.push({ nodeId: node.id, code: 'not_writable' })
        continue
      }
      if (!valueKindsFor(column.type).includes(field.value.kind)) {
        issues.push({ nodeId: node.id, code: 'type_mismatch' })
        continue
      }
      if (field.value.kind === 'literal' && !literalFits(column.type, field.value.value, choiceIds(column))) {
        issues.push({ nodeId: node.id, code: 'type_mismatch' })
      }
      if (field.value.kind === 'column') {
        const source = columnById(triggerTable, field.value.columnId)
        if (!source) issues.push({ nodeId: node.id, code: 'missing_column' })
        else if (!copyFits(column.type, source.type)) issues.push({ nodeId: node.id, code: 'type_mismatch' })
      }
    }
  }
  for (const edge of flow.edges) {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target || target.type === 'trigger') {
      issues.push({ nodeId: edge.source, code: 'meaningless_wire' })
      continue
    }
    if (source.type === 'condition' && edge.when !== 'yes' && edge.when !== 'no') {
      issues.push({ nodeId: source.id, code: 'meaningless_wire' })
    } else if (source.type === 'switch') {
      const caseIds = new Set(source.cases.map((item) => item.id))
      if (edge.when !== 'else' && (edge.when == null || !caseIds.has(edge.when))) {
        issues.push({ nodeId: source.id, code: 'meaningless_wire' })
      }
    } else if ((source.type === 'trigger' || source.type === 'action') && edge.when != null) {
      issues.push({ nodeId: source.id, code: 'meaningless_wire' })
    }
  }
  if (hasCycle(flow.nodes, flow.edges)) {
    issues.push({ nodeId: trigger?.id ?? flow.nodes[0]?.id ?? flow.id, code: 'cycle' })
  }
  return issues
}

function unwrap(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  if (typeof record.statusId === 'string') return record.statusId
  if (typeof record.optionId === 'string') return record.optionId
  if (typeof record.rowId === 'string') return record.rowId
  if (Array.isArray(record.optionIds)) return record.optionIds
  if (Array.isArray(record.tagIds)) return record.tagIds
  if (Array.isArray(record.userIds)) return record.userIds
  return value
}

function isEmpty(value: unknown) {
  const current = unwrap(value)
  if (current == null || current === '') return true
  if (Array.isArray(current)) return current.length === 0
  return false
}

export function isChecked(value: unknown) {
  const current = unwrap(value)
  if (current === true || current === 1) return true
  return typeof current === 'string' && ['true', '1', 'yes'].includes(current.toLowerCase())
}

function asText(value: unknown): string {
  const current = unwrap(value)
  if (current == null) return ''
  if (typeof current === 'string') return current
  if (typeof current === 'number' || typeof current === 'boolean') return String(current)
  if (Array.isArray(current)) return current.map((item) => asText(item)).filter(Boolean).join(', ')
  return ''
}

function asNumber(value: unknown) {
  const current = unwrap(value)
  if (typeof current === 'number' && Number.isFinite(current)) return current
  if (typeof current === 'string' && current.trim() && Number.isFinite(Number(current))) return Number(current)
  return null
}

function idsOf(value: unknown) {
  const current = unwrap(value)
  if (Array.isArray(current)) return current.filter((item): item is string => typeof item === 'string')
  if (typeof current === 'string' && current) return [current]
  return []
}

function sameDay(value: unknown, today: string) {
  const text = asText(value)
  if (!text) return false
  return text.slice(0, 10) === today
}

export function conditionMatches(op: string, type: string, expected: unknown, current: unknown, before: unknown, today = '') {
  if (op === 'empty') return isEmpty(current)
  if (op === 'not_empty') return !isEmpty(current)
  if (op === 'linked') return !isEmpty(current)
  if (op === 'is_true') return isChecked(current)
  if (op === 'is_false') return !isChecked(current)
  if (op === 'changed_true') return isChecked(current) && !isChecked(before)
  if (op === 'changed_false') return !isChecked(current) && isChecked(before)
  if (op === 'today') return sameDay(current, today)
  if (op === 'eq' || op === 'contains' || op === 'starts_with') {
    const left = asText(current).toLowerCase()
    const right = asText(expected).toLowerCase()
    if (op === 'eq') return NUMBER_TYPES.has(type) ? asNumber(current) === asNumber(expected) : left === right
    if (op === 'contains') return left.includes(right)
    return left.startsWith(right)
  }
  if (op === 'gt' || op === 'lt') {
    const left = asNumber(current)
    const right = asNumber(expected)
    if (left == null || right == null) return false
    return op === 'gt' ? left > right : left < right
  }
  if (op === 'before' || op === 'after') {
    const left = Date.parse(asText(current))
    const right = Date.parse(asText(expected))
    if (Number.isNaN(left) || Number.isNaN(right)) return false
    return op === 'before' ? left < right : left > right
  }
  const ids = idsOf(current)
  if (op === 'is') return ids.includes(asText(expected))
  if (op === 'is_not') return !ids.includes(asText(expected))
  if (op === 'any_of' || op === 'contains_any') {
    const wanted = Array.isArray(expected) ? expected.filter((item): item is string => typeof item === 'string') : []
    return wanted.some((item) => ids.includes(item))
  }
  return false
}

export function switchBranch(cases: FlowSwitchCase[], current: unknown) {
  const ids = idsOf(current)
  for (const item of cases) {
    if (item.optionIds.some((id) => ids.includes(id))) return item.id
  }
  return 'else'
}
