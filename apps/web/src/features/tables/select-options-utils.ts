import type { Column } from '@datavalley/api-client'

export type ColumnOption = Column['options'][number]

export function sortOptionsByPosition(options: ColumnOption[]) {
  return [...options].sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0))
}

export function formatSelectCellSummary(options: ColumnOption[], selected: string | string[], multiple: boolean) {
  const ids = multiple
    ? Array.isArray(selected)
      ? selected.map(String)
      : []
    : typeof selected === 'string' && selected
      ? [selected]
      : []
  const byId = new Map(options.map((option) => [option.id, option.label]))
  return ids.map((id) => byId.get(id) ?? id).join(', ')
}

export function mergeColumnOption(column: Column, option: ColumnOption, deleted = false): Column {
  if (deleted) {
    return { ...column, options: column.options.filter((item) => item.id !== option.id) }
  }
  const exists = column.options.some((item) => item.id === option.id)
  const next = exists
    ? column.options.map((item) => (item.id === option.id ? option : item))
    : [...column.options, option]
  return { ...column, options: sortOptionsByPosition(next) }
}
