import { QueryClient } from '@tanstack/react-query'
import { ApiClientError, type RowRecord } from '@datavalley/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readCachedRow } from './cache.js'
import { NotesVersionConflict, notesAfterFailure, saveNotes } from './notes-save.js'

vi.mock('../../lib/api', () => ({
  api: { request: vi.fn() },
}))

import { api } from '../../lib/api.js'

const row = { id: 'row-1', version: 2, notes: 'theirs', cells: {} } as RowRecord

describe('notes save conflicts', () => {
  beforeEach(() => {
    vi.mocked(api.request).mockReset()
  })

  it('stores the server row and reports the conflict notes', async () => {
    const client = new QueryClient()
    client.setQueryData(['rows', 'table-1', '', null, ''], {
      pages: [{ rows: [{ ...row, version: 1, notes: 'mine' }], nextCursor: null }],
      pageParams: [null],
    })
    vi.mocked(api.request).mockRejectedValue(
      new ApiClientError(409, {
        error: { code: 'version_conflict', message: 'Row was updated elsewhere', details: { row } },
      }),
    )
    const failure = saveNotes(client, 'table-1', 'row-1', 1, 'mine again')
    await expect(failure).rejects.toBeInstanceOf(NotesVersionConflict)
    expect(readCachedRow(client, 'table-1', 'row-1')?.notes).toBe('theirs')
    await expect(failure.catch((error: unknown) => notesAfterFailure(error, 'mine'))).resolves.toEqual({
      notes: 'theirs',
      conflict: true,
    })
  })
})
