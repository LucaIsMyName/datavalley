export const filterOperators = [
  'eq',
  'neq',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'gt',
  'lt',
  'between',
  'empty',
  'not_empty',
] as const

export type FilterOperator = (typeof filterOperators)[number]

export type FilterCondition = {
  op: FilterOperator
  columnId: string
  value?: unknown
  valueTo?: unknown
}

export type FilterGroup = {
  op: 'and' | 'or'
  conditions: FilterNode[]
}

export type FilterNode = FilterGroup | FilterCondition

export function isFilterGroup(node: FilterNode): node is FilterGroup {
  return node.op === 'and' || node.op === 'or'
}

function asText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object' && value && 'optionId' in value) return String((value as { optionId: unknown }).optionId)
  return ''
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  if (typeof value === 'object' && value && 'number' in value) {
    const inner = (value as { number: unknown }).number
    return asNumber(inner)
  }
  return null
}

export function compareOp(operator: string, value: unknown, expected?: unknown, expectedTo?: unknown): boolean {
  if (operator === 'empty') return value == null || value === ''
  if (operator === 'not_empty') return !(value == null || value === '')
  if (operator === 'eq') {
    if (typeof value === 'boolean' || typeof expected === 'boolean') return Boolean(value) === Boolean(expected)
    const left = asNumber(value)
    const right = asNumber(expected)
    if (left != null && right != null && typeof expected !== 'boolean') return left === right
    return asText(value) === asText(expected)
  }
  if (operator === 'neq') return !compareOp('eq', value, expected)
  if (operator === 'contains') return asText(value).toLowerCase().includes(asText(expected).toLowerCase())
  if (operator === 'not_contains') return !compareOp('contains', value, expected)
  if (operator === 'starts_with') return asText(value).toLowerCase().startsWith(asText(expected).toLowerCase())
  if (operator === 'ends_with') return asText(value).toLowerCase().endsWith(asText(expected).toLowerCase())
  if (operator === 'gt' || operator === 'lt' || operator === 'between') {
    const leftNumber = asNumber(value)
    const rightNumber = asNumber(expected)
    if (leftNumber != null && rightNumber != null) {
      if (operator === 'gt') return leftNumber > rightNumber
      if (operator === 'lt') return leftNumber < rightNumber
      const end = asNumber(expectedTo)
      return end != null && leftNumber >= rightNumber && leftNumber <= end
    }
    const left = asText(value)
    const right = asText(expected)
    if (operator === 'gt') return left > right
    if (operator === 'lt') return left < right
    return left >= right && left <= asText(expectedTo)
  }
  return false
}
