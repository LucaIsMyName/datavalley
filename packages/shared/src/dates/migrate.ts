import { isDateRangeValue, type DateRangeValue } from './format.js'

export type DateColumnMode = { range: boolean; includeTime: boolean }

function datePart(value: string) {
  return value.slice(0, 10)
}

function withTime(value: string, includeTime: boolean) {
  const date = datePart(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return value
  if (!includeTime) return date
  if (value.includes('T') && value.length >= 16) return value.slice(0, 16)
  return `${date}T00:00`
}

export function migrateDateCell(value: unknown, next: DateColumnMode): unknown {
  if (value == null || value === '') return value ?? null
  if (isDateRangeValue(value)) {
    const from = withTime(value.from, next.includeTime)
    const to = withTime(value.to, next.includeTime)
    if (!next.range) return from
    return { from, to } satisfies DateRangeValue
  }
  if (typeof value !== 'string') return value
  const single = withTime(value, next.includeTime)
  if (!next.range) return single
  return { from: single, to: single } satisfies DateRangeValue
}
