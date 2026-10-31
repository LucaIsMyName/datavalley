import { describe, expect, it } from 'vitest'
import { isTableReadOnly, tableReadOnlyReason } from './table-read-only'

describe('tableReadOnlyReason', () => {
  it('returns mirror before locked', () => {
    expect(tableReadOnlyReason({ lockedAt: '2024-01-01T00:00:00.000Z', mirrorOfTableId: 's' })).toBe('mirror')
  })

  it('returns locked when only lockedAt is set', () => {
    expect(tableReadOnlyReason({ lockedAt: '2024-01-01T00:00:00.000Z', mirrorOfTableId: null })).toBe('locked')
  })

  it('returns null for editable tables', () => {
    expect(isTableReadOnly({ lockedAt: null, mirrorOfTableId: null })).toBe(false)
  })
})
