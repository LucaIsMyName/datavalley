import { describe, expect, it } from 'vitest'
import { isTableReadOnly, tableReadOnlyReason } from './table-read-only'

describe('tableReadOnlyReason', () => {
  it('returns mirror before locked', () => {
    expect(
      tableReadOnlyReason({ lockedAt: '2024-01-01T00:00:00.000Z', mirrorOfTableId: 's' }),
    ).toBe('mirror')
  })

  it('returns locked when only lockedAt is set', () => {
    expect(
      tableReadOnlyReason({ lockedAt: '2024-01-01T00:00:00.000Z', mirrorOfTableId: null }),
    ).toBe('locked')
  })

  it('returns connector before locked when a connector is linked', () => {
    expect(
      tableReadOnlyReason({
        lockedAt: '2024-01-01T00:00:00.000Z',
        mirrorOfTableId: null,
        connector: {
          id: 'c',
          name: 'Feed',
          lastSyncAt: null,
          lastSyncStatus: null,
          lastError: null,
        },
      }),
    ).toBe('connector')
    expect(
      isTableReadOnly({
        lockedAt: null,
        mirrorOfTableId: null,
        connector: {
          id: 'c',
          name: 'Feed',
          lastSyncAt: null,
          lastSyncStatus: null,
          lastError: null,
        },
      }),
    ).toBe(true)
  })

  it('returns null for editable tables', () => {
    expect(isTableReadOnly({ lockedAt: null, mirrorOfTableId: null, connector: null })).toBe(false)
  })
})
