import type { DateColumnKind } from './format.js'

export function dateColumnIncludesTime(column: { type: string; config?: Record<string, unknown> }): boolean {
  if (column.type === 'datetime') return true
  if (column.type !== 'date') return false
  return Boolean(column.config?.includeTime)
}

export function isDateColumnType(type: string) {
  return type === 'date' || type === 'datetime'
}

export function dateColumnKind(column: { type: string; config?: Record<string, unknown> }): DateColumnKind {
  return dateColumnIncludesTime(column) ? 'datetime' : 'date'
}
