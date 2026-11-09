import { ApiClientError, type RowRecord } from '@datavalley/api-client'
import { describe, expect, it } from 'vitest'
import { rowFromVersionConflict } from './version-conflict.js'

describe('rowFromVersionConflict', () => {
  it('returns the row from a version_conflict response', () => {
    const row: RowRecord = {
      id: 'r1',
      position: 'a0',
      version: 3,
      color: null,
      notes: '',
      rowNumber: 1,
      cells: { c1: 'x' },
      backgrounds: {},
    }
    const error = new ApiClientError(409, {
      error: { code: 'version_conflict', message: 'Row was updated elsewhere', details: { row } },
    })
    expect(rowFromVersionConflict(error)).toEqual(row)
  })

  it('returns null for other errors', () => {
    expect(rowFromVersionConflict(new ApiClientError(409, { error: { code: 'conflict' } }))).toBeNull()
    expect(rowFromVersionConflict(new Error('nope'))).toBeNull()
  })
})
