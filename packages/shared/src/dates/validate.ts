import type { DateColumnKind, DateRangeValue } from './format.js'
import { compareDateValues, isDateRangeValue } from './format.js'

export function isIsoDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

export function validateDateEnd(value: string): boolean {
  return isIsoDateOnly(value)
}

export function validateDatetimeEnd(value: string): boolean {
  if (isIsoDateOnly(value)) return true
  return !Number.isNaN(new Date(value).getTime())
}

export function validateDateRangePayload(
  input: unknown,
  kind: DateColumnKind,
): { ok: true; value: DateRangeValue } | { ok: false; reason: 'invalidShape' | 'invalidEnd' | 'endNotAfterStart' } {
  if (!isDateRangeValue(input)) return { ok: false, reason: 'invalidShape' }
  const validate = kind === 'date' ? validateDateEnd : validateDatetimeEnd
  if (!validate(input.from) || !validate(input.to)) return { ok: false, reason: 'invalidEnd' }
  if (compareDateValues(input.from, input.to, kind) > 0) return { ok: false, reason: 'endNotAfterStart' }
  return { ok: true, value: { from: input.from.trim(), to: input.to.trim() } }
}
