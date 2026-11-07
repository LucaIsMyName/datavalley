import { ApiClientError, type RowRecord } from '@datavalley/api-client'
import { describe, expect, it } from 'vitest'
import { rowFromVersionConflict } from './version-conflict.js'

describe('rowFromVersionConflict', () => {
  it('returns the row from a version_conflict response', () => {
    const row = { id: 'r1', version: 3, cells: { c1: 'x' } } as RowRecord
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
