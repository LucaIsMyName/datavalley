export type SelectColumnLike = { type: string; config?: Record<string, unknown> }

export function isSelectFamilyType(type: string) {
  return type === 'select' || type === 'multi_select' || type === 'radio'
}

export function selectColumnMultiple(column: SelectColumnLike) {
  if (column.type === 'multi_select') return true
  if (column.type === 'radio') return false
  if (column.type === 'select') return Boolean(column.config?.multiple)
  return false
}
