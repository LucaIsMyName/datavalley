import { isFormulaError, type FormulaValue } from '@datavalley/formula-engine'

export type FormatColumn = {
  id: string
  type: string
  options?: { id: string; label: string }[]
}

export type FormatLabels = {
  tags: { id: string; name: string }[]
  statuses: { id: string; name: string }[]
  members: { id: string; name: string }[]
}

function named(pool: { id: string; name: string }[], id: string, options?: { id: string; label: string }[]) {
  return pool.find((item) => item.id === id)?.name ?? options?.find((option) => option.id === id)?.label ?? id
}

export function presentFormatValue(column: FormatColumn, raw: unknown, labels: FormatLabels): FormulaValue {
  if (column.type === 'media') return null
  if (isFormulaError(raw)) return raw
  if (raw == null || raw === '') return null
  if (column.type === 'number' || column.type === 'currency') return typeof raw === 'number' ? raw : null
  if (column.type === 'checkbox') return raw === true
  if (column.type === 'tags' || column.type === 'multi_select' || column.type === 'user') {
    const ids = Array.isArray(raw) ? raw.map(String) : []
    const pool = column.type === 'tags' ? labels.tags : column.type === 'user' ? labels.members : (column.options ?? []).map((option) => ({ id: option.id, name: option.label }))
    return ids.map((id) => named(pool, id, column.options))
  }
  if (column.type === 'status') return named(labels.statuses, String(raw), column.options)
  if (column.type === 'select' || column.type === 'radio') return named([], String(raw), column.options)
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return raw
  return null
}

export function presentFormatRow(columns: FormatColumn[], cells: Record<string, unknown>, labels: FormatLabels) {
  const values: Record<string, FormulaValue> = {}
  for (const column of columns) values[column.id] = presentFormatValue(column, cells[column.id], labels)
  return values
}
