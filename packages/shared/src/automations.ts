export const STAGE_FOLLOW_UP_RULE_ID = 'stage-follow-up'
export const MAX_AUTOMATION_RULES = 20
export const MAX_AUTOMATION_CELLS = 20
export const MAX_AUTOMATION_TEMPLATE = 200

export type BuiltinAutomationRule = {
  id: typeof STAGE_FOLLOW_UP_RULE_ID
  builtin: true
  enabled: boolean
}

export type AutomationCellTemplate = {
  columnId: string
  template: string
}

export type CustomAutomationRule = {
  id: string
  builtin: false
  enabled: boolean
  sourceTableId: string
  sourceColumnId: string
  action: 'create' | 'update'
  targetTableId: string
  linkColumnId: string | null
  cells: AutomationCellTemplate[]
}

export type AutomationRule = BuiltinAutomationRule | CustomAutomationRule

const TEMPLATE_TOKEN = /\{\{\s*(label|value|today|row)\s*\}\}/gi

export function builtinStageRule(enabled = true): BuiltinAutomationRule {
  return { id: STAGE_FOLLOW_UP_RULE_ID, builtin: true, enabled }
}

export function fillAutomationTemplate(template: string, vars: Record<string, string>) {
  return template.replace(TEMPLATE_TOKEN, (_, key: string) => vars[key.toLowerCase()] ?? '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseCell(value: unknown): AutomationCellTemplate | null {
  if (!isRecord(value)) return null
  if (typeof value.columnId !== 'string' || typeof value.template !== 'string') return null
  if (!value.columnId || value.template.length > MAX_AUTOMATION_TEMPLATE) return null
  return { columnId: value.columnId, template: value.template }
}

export function parseAutomationRule(value: unknown): AutomationRule | null {
  if (!isRecord(value)) return null
  if (value.id === STAGE_FOLLOW_UP_RULE_ID) return builtinStageRule(value.enabled === true)
  if (value.builtin === true) return null
  if (typeof value.id !== 'string' || value.id.length < 8) return null
  if (value.action !== 'create' && value.action !== 'update') return null
  if (
    typeof value.sourceTableId !== 'string' ||
    typeof value.sourceColumnId !== 'string' ||
    typeof value.targetTableId !== 'string'
  ) {
    return null
  }
  if (value.linkColumnId != null && typeof value.linkColumnId !== 'string') return null
  if (!Array.isArray(value.cells) || value.cells.length > MAX_AUTOMATION_CELLS) return null
  const cells = value.cells.map(parseCell)
  if (cells.some((cell) => !cell)) return null
  return {
    id: value.id,
    builtin: false,
    enabled: value.enabled === true,
    sourceTableId: value.sourceTableId,
    sourceColumnId: value.sourceColumnId,
    action: value.action,
    targetTableId: value.targetTableId,
    linkColumnId: typeof value.linkColumnId === 'string' ? value.linkColumnId : null,
    cells: cells as AutomationCellTemplate[],
  }
}

export function withBuiltin(rules: AutomationRule[]): AutomationRule[] {
  const builtin = rules.find((rule) => rule.builtin) ?? builtinStageRule(true)
  const custom: CustomAutomationRule[] = []
  const seen = new Set<string>()
  for (const rule of rules) {
    if (rule.builtin || seen.has(rule.id)) continue
    seen.add(rule.id)
    custom.push(rule)
    if (custom.length >= MAX_AUTOMATION_RULES) break
  }
  return [builtin, ...custom]
}

export function rulesFromSettings(settings: unknown): AutomationRule[] | null {
  if (!isRecord(settings)) return null
  if (!isRecord(settings.automations) || !Array.isArray(settings.automations.rules)) return null
  const parsed = settings.automations.rules.map(parseAutomationRule).filter((rule): rule is AutomationRule => Boolean(rule))
  return withBuiltin(parsed)
}

export function effectiveAutomationRules(settings: unknown): AutomationRule[] {
  return rulesFromSettings(settings) ?? [builtinStageRule(true)]
}
