import type { QueryClient } from '@tanstack/react-query'
import type { RowRecord } from '@datavalley/api-client'
import { api } from '../../lib/api'
import { replaceCachedRows } from './cache'
import { rowFromVersionConflict } from './version-conflict'

export class NotesVersionConflict extends Error {
  readonly row: RowRecord

  constructor(row: RowRecord) {
    super('version_conflict')
    this.row = row
  }
}

export async function saveNotes(
  queryClient: QueryClient,
  tableId: string,
  rowId: string,
  version: number,
  notes: string,
) {
  try {
    const result = await api.request<{ row: RowRecord }>(`/rows/${rowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ version, cells: {}, notes }),
    })
    return result.row
  } catch (error) {
    const fresh = rowFromVersionConflict(error)
    if (!fresh) throw error
    replaceCachedRows(queryClient, tableId, [fresh])
    throw new NotesVersionConflict(fresh)
  }
}

/** Notes to show after a failed save. A conflict shows the server copy. */
export function notesAfterFailure(reason: unknown, baseline: string) {
  if (reason instanceof NotesVersionConflict) return { notes: reason.row.notes, conflict: true }
  return { notes: baseline, conflict: false }
}
