export type DateColumnKind = 'date' | 'datetime'

export type DateRangeValue = { from: string; to: string }

export function appIntlLocale(language: string): string {
  return language.startsWith('de') ? 'de-DE' : 'en-US'
}

function parseInstant(value: string, kind: DateColumnKind): Date | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T12:00:00Z`)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateValue(
  value: string,
  options: { kind: DateColumnKind; locale: string; timeZone?: string },
): string {
  const instant = parseInstant(value, options.kind)
  if (!instant) return value
  const intlLocale = appIntlLocale(options.locale)
  if (options.kind === 'date') {
    const timeZone = options.timeZone ?? 'UTC'
    return new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium', timeZone }).format(instant)
  }
  const intlOptions: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }
  if (options.timeZone) intlOptions.timeZone = options.timeZone
  return new Intl.DateTimeFormat(intlLocale, intlOptions).format(instant)
}

export function isDateRangeValue(value: unknown): value is DateRangeValue {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.from === 'string' && typeof record.to === 'string'
}

export function formatDateCellValue(
  value: unknown,
  column: { type: string; config?: Record<string, unknown> },
  language: string,
): string {
  if (value == null || value === '') return ''
  const kind: DateColumnKind = column.type === 'datetime' ? 'datetime' : 'date'
  if (isDateRangeValue(value)) {
    const from = formatDateValue(value.from, { kind, locale: language })
    const to = formatDateValue(value.to, { kind, locale: language })
    return `${from} – ${to}`
  }
  if (typeof value === 'string') return formatDateValue(value, { kind, locale: language })
  return String(value)
}

export function compareDateValues(a: string, b: string, kind: DateColumnKind): number {
  const left = parseInstant(a, kind)?.getTime() ?? NaN
  const right = parseInstant(b, kind)?.getTime() ?? NaN
  if (Number.isNaN(left) || Number.isNaN(right)) return 0
  return left - right
}
