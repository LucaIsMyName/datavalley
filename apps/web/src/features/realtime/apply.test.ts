import { QueryClient } from '@tanstack/react-query'
import type { RowRecord } from '@datavalley/api-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyRealtimeEvent, applyRemoteRow, applyStashedCell } from './apply.js'
import { clearCellEditing, setCellEditing } from './editing.js'

function seed(client: QueryClient) {
  const row = {
    id: 'row-1',
    position: 'a0',
    version: 1,
    color: null,
    notes: '',
    rowNumber: 1,
    cells: { name: 'Ada', city: 'London' },
    backgrounds: {},
  } as RowRecord
  client.setQueryData(['rows', 'table-1', '', null, ''], {
    pages: [{ rows: [row], nextCursor: null }],
    pageParams: [null],
  })
}

function readName(client: QueryClient) {
  const data = client.getQueryData<{ pages: { rows: RowRecord[] }[] }>(['rows', 'table-1', '', null, ''])
  return data?.pages[0]?.rows[0]
}

describe('remote row apply', () => {
  it('updates a loaded row and ignores the writer echo', () => {
    const client = new QueryClient()
    seed(client)
    applyRealtimeEvent(client, {
      id: '1',
      type: 'row.updated',
      actorId: 'me',
      projectId: 'project-1',
      tableId: 'table-1',
      row: {
        id: 'row-1',
        position: 'a0',
        version: 2,
        color: null,
        notes: '',
        rowNumber: 1,
        cells: { name: 'Grace', city: 'London' },
        backgrounds: {},
      },
    }, 'me')
    expect(readName(client)?.cells.name).toBe('Ada')
    applyRemoteRow(client, 'table-1', {
      id: 'row-1',
      position: 'a0',
      version: 3,
      color: null,
      notes: 'hi',
      rowNumber: 1,
      cells: { name: 'Grace', city: 'Paris' },
      backgrounds: {},
    })
    expect(readName(client)?.cells).toEqual({ name: 'Grace', city: 'Paris' })
    expect(readName(client)?.notes).toBe('hi')
  })

  it('keeps the cell being edited and applies it when that edit ends', () => {
    const client = new QueryClient()
    seed(client)
    setCellEditing('row-1', 'name')
    applyRemoteRow(client, 'table-1', {
      id: 'row-1',
      position: 'a0',
      version: 4,
      color: null,
      notes: '',
      rowNumber: 1,
      cells: { name: 'Grace', city: 'Paris' },
      backgrounds: {},
    })
    expect(readName(client)?.cells.name).toBe('Ada')
    expect(readName(client)?.cells.city).toBe('Paris')
    clearCellEditing()
    applyStashedCell(client, 'table-1', 'row-1', 'name')
    expect(readName(client)?.cells.name).toBe('Grace')
  })

  it('leaves a row that is not loaded alone', () => {
    const client = new QueryClient()
    seed(client)
    applyRemoteRow(client, 'table-1', {
      id: 'row-9',
      position: 'b0',
      version: 1,
      color: null,
      notes: '',
      rowNumber: 2,
      cells: { name: 'New' },
      backgrounds: {},
    })
    expect(readName(client)?.id).toBe('row-1')
  })

  it('debounces rows.changed invalidation', () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    applyRealtimeEvent(
      client,
      { id: '1', type: 'rows.changed', actorId: 'other', projectId: 'p1', tableId: 'table-1' },
      'me',
    )
    applyRealtimeEvent(
      client,
      { id: '2', type: 'rows.changed', actorId: 'other', projectId: 'p1', tableId: 'table-1' },
      'me',
    )
    expect(invalidate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(250)
    expect(invalidate).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
