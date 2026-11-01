export type SelectColumnMode = { multiple: boolean }

export function migrateSelectCell(value: unknown, next: SelectColumnMode): unknown {
  if (next.multiple) {
    if (Array.isArray(value)) return value.map(String)
    if (value == null || value === '') return []
    return [String(value)]
  }
  if (Array.isArray(value)) {
    const first = value.map(String).find(Boolean)
    return first ?? null
  }
  if (value == null || value === '') return null
  return String(value)
}
