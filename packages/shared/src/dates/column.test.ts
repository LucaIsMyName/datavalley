import { describe, expect, it } from 'vitest'
import { dateColumnIncludesTime, dateColumnKind, isDateColumnType } from './column.js'

describe('date column helpers', () => {
  it('treats legacy datetime type as including time', () => {
    expect(isDateColumnType('datetime')).toBe(true)
    expect(dateColumnIncludesTime({ type: 'datetime', config: {} })).toBe(true)
    expect(dateColumnKind({ type: 'datetime', config: {} })).toBe('datetime')
  })

  it('uses includeTime on date columns', () => {
    expect(dateColumnIncludesTime({ type: 'date', config: {} })).toBe(false)
    expect(dateColumnIncludesTime({ type: 'date', config: { includeTime: true } })).toBe(true)
    expect(dateColumnKind({ type: 'date', config: { includeTime: true } })).toBe('datetime')
  })
})
