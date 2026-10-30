import { compareOp } from './filters.js'

export type FormatStyle = {
  color?: string
  background?: string
  bold?: boolean
  italic?: boolean
  icon?: string
}

export type FormatRule = {
  id: string
  scope: 'cell' | 'row'
  columnId?: string
  operator: string
  value?: unknown
  valueTo?: unknown
  style: FormatStyle
}

export function ruleMatches(rule: FormatRule, cells: Record<string, unknown>): boolean {
  const columnId = rule.columnId
  if (!columnId) return false
  return compareOp(rule.operator, cells[columnId] ?? null, rule.value, rule.valueTo)
}

export function stylesForCell(
  rules: FormatRule[],
  cells: Record<string, unknown>,
  columnId: string,
): FormatStyle {
  const style: FormatStyle = {}
  for (const rule of rules) {
    if (rule.scope === 'cell' && rule.columnId && rule.columnId !== columnId) continue
    const target = rule.scope === 'row' ? { ...rule, columnId: rule.columnId ?? columnId } : rule
    if (!ruleMatches(target, cells)) continue
    Object.assign(style, rule.style)
  }
  return style
}
