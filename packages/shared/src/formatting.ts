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
  operator?: string
  value?: unknown
  valueTo?: unknown
  expression?: string
  style: FormatStyle
}

function formulaLiteral(value: unknown) {
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  const text = value == null ? '' : String(value)
  const trimmed = text.trim()
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true' ? 'TRUE' : 'FALSE'
  if (trimmed !== '' && /^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed
  return `"${trimmed.replaceAll('"', '""')}"`
}

export function expressionFromOperator(rule: Pick<FormatRule, 'operator' | 'value' | 'valueTo'>): string | null {
  const operator = rule.operator
  if (!operator) return null
  const literal = formulaLiteral(rule.value)
  if (operator === 'empty') return 'ISBLANK(IT)'
  if (operator === 'not_empty') return 'NOT(ISBLANK(IT))'
  if (operator === 'eq') return `IT = ${literal}`
  if (operator === 'neq') return `IT <> ${literal}`
  if (operator === 'gt') return `IT > ${literal}`
  if (operator === 'lt') return `IT < ${literal}`
  if (operator === 'contains') return `CONTAINS(IT, ${literal})`
  if (operator === 'not_contains') return `NOT(CONTAINS(IT, ${literal}))`
  if (operator === 'starts_with') {
    const text = rule.value == null ? '' : String(rule.value)
    return `LEFT(IT, ${text.length}) = ${formulaLiteral(text)}`
  }
  if (operator === 'ends_with') {
    const text = rule.value == null ? '' : String(rule.value)
    return `RIGHT(IT, ${text.length}) = ${formulaLiteral(text)}`
  }
  if (operator === 'between') return `AND(IT >= ${literal}, IT <= ${formulaLiteral(rule.valueTo)})`
  return null
}

export function ruleMatches(rule: FormatRule, cells: Record<string, unknown>): boolean {
  const columnId = rule.columnId
  if (!columnId || !rule.operator || rule.expression) return false
  return compareOp(rule.operator, cells[columnId] ?? null, rule.value, rule.valueTo)
}

export function stylesForCell(
  rules: FormatRule[],
  cells: Record<string, unknown>,
  columnId: string,
): FormatStyle {
  const style: FormatStyle = {}
  for (const rule of rules) {
    if (rule.expression || !rule.operator) continue
    if (rule.scope === 'cell' && rule.columnId && rule.columnId !== columnId) continue
    const target = rule.scope === 'row' ? { ...rule, columnId: rule.columnId ?? columnId } : rule
    if (!ruleMatches(target, cells)) continue
    Object.assign(style, rule.style)
  }
  return style
}

function firstExpression(rules: FormatRule[], matches: (expression: string) => boolean): FormatStyle | null {
  for (const rule of rules) {
    if (!rule.expression || !matches(rule.expression)) continue
    return { ...rule.style }
  }
  return null
}

export function conditionalStyle(
  columnRules: FormatRule[],
  cellRules: FormatRule[] | undefined,
  cells: Record<string, unknown>,
  columnId: string,
  matches: (expression: string) => boolean,
): FormatStyle {
  if (cellRules && cellRules.length > 0) return firstExpression(cellRules, matches) ?? {}
  const expressions = columnRules.filter((rule) => rule.expression && rule.columnId === columnId)
  const hit = firstExpression(expressions, matches)
  if (hit) return hit
  return stylesForCell(
    columnRules.filter((rule) => !rule.expression),
    cells,
    columnId,
  )
}
