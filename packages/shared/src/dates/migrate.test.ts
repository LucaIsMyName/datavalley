import { describe, expect, it } from 'vitest'
import { migrateDateCell } from './migrate.js'
import { validateDateRangePayload } from './validate.js'

describe('migrateDateCell', () => {
  it('turns a single date into a same-day range and back', () => {
    expect(migrateDateCell('2026-03-04', { range: true, includeTime: false })).toEqual({
      from: '2026-03-04',
      to: '2026-03-04',
    })
    expect(migrateDateCell({ from: '2026-03-04', to: '2026-03-09' }, { range: false, includeTime: false })).toBe(
      '2026-03-04',
    )
  })

  it('adds or drops the time on single values and both range ends', () => {
    expect(migrateDateCell('2026-03-04', { range: false, includeTime: true })).toBe('2026-03-04T00:00')
    expect(migrateDateCell('2026-03-04T14:30', { range: false, includeTime: false })).toBe('2026-03-04')
    expect(
      migrateDateCell({ from: '2026-03-04', to: '2026-03-04' }, { range: true, includeTime: true }),
    ).toEqual({ from: '2026-03-04T00:00', to: '2026-03-04T00:00' })
  })

  it('leaves empty cells empty', () => {
    expect(migrateDateCell(null, { range: true, includeTime: true })).toBeNull()
    expect(migrateDateCell('', { range: true, includeTime: false })).toBe('')
  })
})

describe('validateDateRangePayload', () => {
  it('allows a range that starts and ends on the same day', () => {
    expect(validateDateRangePayload({ from: '2026-03-04', to: '2026-03-04' }, 'date').ok).toBe(true)
  })

  it('rejects an end that is before the start', () => {
    expect(validateDateRangePayload({ from: '2026-03-09', to: '2026-03-04' }, 'date')).toEqual({
      ok: false,
      reason: 'endNotAfterStart',
    })
  })
})
