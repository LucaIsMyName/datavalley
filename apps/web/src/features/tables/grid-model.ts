import type { FilterNode, FilterOperator } from '@datavalley/shared'

export function operatorsFor(type: string) {
  if (['number', 'currency', 'date'].includes(type) || type === 'datetime')
    return ['eq', 'gt', 'lt', 'empty', 'not_empty']
  if (type === 'checkbox') return ['eq', 'empty', 'not_empty']
  if (['select', 'radio', 'multi_select', 'relation'].includes(type))
    return ['eq', 'neq', 'empty', 'not_empty']
  return ['eq', 'contains', 'starts_with', 'empty', 'not_empty']
}

export function nextLabel(names: string[], base: string) {
  if (!names.includes(base)) return base
  let index = 2
  while (names.includes(`${base} ${index}`)) index += 1
  return `${base} ${index}`
}

export function moveIdBefore(ids: string[], fromId: string, toId: string) {
  if (fromId === toId) return ids
  const next = ids.filter((id) => id !== fromId)
  const index = next.indexOf(toId)
  if (index < 0) return ids
  next.splice(index, 0, fromId)
  return next
}

export function filtersFrom(node: FilterNode | null | undefined) {
  const next: Record<string, { op: string; value: string }> = {}
  const list = node && 'conditions' in node ? node.conditions : node ? [node] : []
  for (const condition of list) {
    if (!condition || !('columnId' in condition)) continue
    next[condition.columnId] = {
      op: condition.op,
      value: condition.value == null ? '' : String(condition.value),
    }
  }
  return next
}

export function activeFilter(
  filters: Record<string, { op: string; value: string }>,
): FilterNode | null {
  const conditions: FilterNode[] = Object.entries(filters)
    .filter(
      ([, filter]) => filter.op === 'empty' || filter.op === 'not_empty' || filter.value !== '',
    )
    .map(([columnId, filter]) => ({
      op: filter.op as FilterOperator,
      columnId,
      value: filter.value,
    }))
  if (conditions.length === 0) return null
  if (conditions.length === 1) return conditions[0]
  return { op: 'and', conditions }
}

export function footerValue(
  calc: string,
  stats: {
    count: number
    empty: number
    filled: number
    unique: number
    sum: number | null
    avg: number | null
    median: number | null
    min: unknown
    max: unknown
  },
) {
  if (calc === 'percent_empty')
    return stats.count === 0 ? '0%' : `${Math.round((stats.empty / stats.count) * 100)}%`
  if (calc === 'percent_filled')
    return stats.count === 0 ? '0%' : `${Math.round((stats.filled / stats.count) * 100)}%`
  if (calc === 'sum') return stats.sum == null ? '' : String(stats.sum)
  if (calc === 'avg') return stats.avg == null ? '' : String(Math.round(stats.avg * 100) / 100)
  if (calc === 'median') return stats.median == null ? '' : String(stats.median)
  if (calc === 'min' || calc === 'max') return stats[calc] == null ? '' : String(stats[calc])
  return String(stats[calc as 'count' | 'unique' | 'empty' | 'filled'] ?? '')
}
