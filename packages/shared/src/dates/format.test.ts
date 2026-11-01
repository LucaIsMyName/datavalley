import { describe, expect, it } from 'vitest'
import { appIntlLocale, formatDateCellValue, formatDateValue, isDateRangeValue } from './format.js'

describe('date format', () => {
  it('maps app language to Intl locale', () => {
    expect(appIntlLocale('en')).toBe('en-US')
    expect(appIntlLocale('de')).toBe('de-DE')
    expect(appIntlLocale('de-AT')).toBe('de-DE')
  })

  it('formats a date-only value in English and German', () => {
    expect(formatDateValue('2026-01-15', { kind: 'date', locale: 'en' })).toBe('Jan 15, 2026')
    expect(formatDateValue('2026-01-15', { kind: 'date', locale: 'de' })).toBe('15.01.2026')
  })

  it('formats datetime with time in UTC', () => {
    const en = formatDateValue('2026-01-15T14:30:00.000Z', { kind: 'datetime', locale: 'en', timeZone: 'UTC' })
    expect(en).toContain('Jan')
    expect(en).toContain('2026')
    expect(en).toMatch(/2:30/)
  })

  it('formats range cells with an en dash', () => {
    const text = formatDateCellValue(
      { from: '2026-01-01', to: '2026-01-15' },
      { type: 'date', config: { range: true } },
      'en',
    )
    expect(text).toContain(' – ')
    expect(isDateRangeValue({ from: '2026-01-01', to: '2026-01-15' })).toBe(true)
  })
})
