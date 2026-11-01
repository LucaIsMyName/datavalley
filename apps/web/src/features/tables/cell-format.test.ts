import { describe, expect, it } from 'vitest'
import { cellFormatError } from './cell-format.js'

describe('cell format', () => {
  it('accepts a well formed value for each checked type', () => {
    expect(cellFormatError({ type: 'mail' }, 'ada@example.com')).toBeNull()
    expect(cellFormatError({ type: 'url' }, 'https://example.com')).toBeNull()
    expect(cellFormatError({ type: 'number' }, '12.5')).toBeNull()
    expect(cellFormatError({ type: 'number', config: { variant: 'integer' } }, '4')).toBeNull()
    expect(cellFormatError({ type: 'date' }, '2026-01-02')).toBeNull()
    expect(cellFormatError({ type: 'datetime' }, '2026-01-02T15:04:00Z')).toBeNull()
    expect(
      cellFormatError({ type: 'date', config: { range: true } }, { from: '2026-01-01', to: '2026-01-15' }),
    ).toBeNull()
    expect(cellFormatError({ type: 'mail' }, '')).toBeNull()
  })

  it('names the format that does not match', () => {
    expect(cellFormatError({ type: 'mail' }, 'not-an-email')).toBe('invalidMail')
    expect(cellFormatError({ type: 'url' }, 'example.com')).toBe('invalidUrl')
    expect(cellFormatError({ type: 'number' }, 'twelve')).toBe('invalidNumber')
    expect(cellFormatError({ type: 'number', config: { variant: 'integer' } }, '1.5')).toBe('invalidInteger')
    expect(cellFormatError({ type: 'date' }, 'yesterday')).toBe('invalidDate')
    expect(cellFormatError({ type: 'datetime' }, 'yesterday')).toBe('invalidDatetime')
    expect(cellFormatError({ type: 'date', config: { range: true } }, { from: '2026-01-15', to: '2026-01-01' })).toBe(
      'rangeEndBeforeStart',
    )
  })
})
