import { dateColumnIncludesTime, isDateColumnType, isDateRangeValue, validateDateRangePayload } from '@datavalley/shared'

export type CellFormatKey =
  | 'invalidMail'
  | 'invalidUrl'
  | 'invalidNumber'
  | 'invalidInteger'
  | 'invalidDate'
  | 'invalidDatetime'
  | 'invalidDateRange'
  | 'rangeEndBeforeStart'

export function cellFormatError(
  column: { type: string; config?: Record<string, unknown> },
  input: unknown,
): CellFormatKey | null {
  if (input == null || input === '') return null
  if (column.type === 'mail') {
    const value = String(input).trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'invalidMail'
    return null
  }
  if (column.type === 'url') {
    try {
      const url = new URL(String(input))
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'invalidUrl'
    } catch {
      return 'invalidUrl'
    }
    return null
  }
  if (column.type === 'number' || column.type === 'currency') {
    const numeric = typeof input === 'number' ? input : Number(String(input).trim())
    if (!Number.isFinite(numeric)) return 'invalidNumber'
    const variant = column.type === 'currency' ? 'money' : String(column.config?.variant ?? 'float')
    if (variant === 'integer' && !Number.isInteger(numeric)) return 'invalidInteger'
    return null
  }
  if (isDateColumnType(column.type)) {
    const kind = dateColumnIncludesTime(column) ? 'datetime' : 'date'
    if (column.config?.range) {
      if (input == null || input === '') return null
      if (!isDateRangeValue(input)) return 'invalidDateRange'
      const checked = validateDateRangePayload(input, kind)
      if (!checked.ok) {
        if (checked.reason === 'endNotAfterStart') return 'rangeEndBeforeStart'
        return 'invalidDateRange'
      }
      return null
    }
    if (!dateColumnIncludesTime(column)) {
      const value = String(input)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return 'invalidDate'
      return null
    }
    const raw = String(input)
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
    if (Number.isNaN(new Date(raw).getTime())) return 'invalidDatetime'
    return null
  }
  return null
}
