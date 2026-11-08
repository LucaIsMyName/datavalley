import { ApiClientError, type RowRecord } from '@datavalley/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({
  api: { request: vi.fn() },
}))

import { api } from '../../lib/api.js'
import { historyFlags, pushCommand, undoTable } from './history.js'

function conflict(version: number) {
  return new ApiClientError(409, {
    error: {
      code: 'version_conflict',
      message: 'Row was updated elsewhere',
      details: { row: { id: 'row-1', version, notes: '', cells: {} } as RowRecord },
    },
  })
}

describe('undo version conflicts', () => {
  beforeEach(() => {
    vi.mocked(api.request).mockReset()
  })

  it('retries once with the server version', async () => {
    const tableId = 'history-retry'
    vi.mocked(api.request)
      .mockRejectedValueOnce(conflict(4))
      .mockResolvedValueOnce({ row: { version: 5 } })
    pushCommand(tableId, {
      kind: 'patch',
      undo: [{ rowId: 'row-1', version: 2, cells: { name: 'Ada' } }],
      redo: [{ rowId: 'row-1', version: 2, cells: { name: 'Grace' } }],
    })
    await expect(undoTable(tableId)).resolves.toBe(true)
    expect(api.request).toHaveBeenCalledTimes(2)
    const body = JSON.parse(String(vi.mocked(api.request).mock.calls[1]?.[1]?.body))
    expect(body.version).toBe(4)
    expect(historyFlags(tableId).canUndo).toBe(false)
  })

  it('keeps the command when the retry also conflicts', async () => {
    const tableId = 'history-keep'
    vi.mocked(api.request).mockRejectedValue(conflict(4))
    pushCommand(tableId, {
      kind: 'patch',
      undo: [{ rowId: 'row-1', version: 2, cells: { name: 'Ada' } }],
      redo: [{ rowId: 'row-1', version: 2, cells: { name: 'Grace' } }],
    })
    await expect(undoTable(tableId)).rejects.toBeInstanceOf(ApiClientError)
    expect(api.request).toHaveBeenCalledTimes(2)
    expect(historyFlags(tableId).canUndo).toBe(true)
  })
})
