import { QueryClient } from '@tanstack/react-query'
import type { RowRecord } from '@datavalley/api-client'
import type { RealtimeRow } from '@datavalley/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyRealtimeEvent, applyRemoteRow, applyStashedCell, resetRealtimeApplyForTests } from './apply.js'
import { clearCellEditing, setCellEditing, setNotesEditing } from './editing.js'

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

function echo(version: number, name: string, id = 'row-1'): RealtimeRow {
  return {
    id,
    position: 'a0',
    version,
    color: null,
    notes: '',
    rowNumber: 1,
    cells: { name, city: 'London' },
    backgrounds: {},
  }
}

function invalidatedRows(invalidate: { mock: { calls: unknown[][] } }, tableId: string) {
  return invalidate.mock.calls.some((call) => {
    const key = (call[0] as { queryKey?: unknown[] } | undefined)?.queryKey
    return Array.isArray(key) && key[0] === 'rows' && key[1] === tableId
  })
}

function invalidatedFooter(invalidate: { mock: { calls: unknown[][] } }, tableId: string) {
  return invalidate.mock.calls.some((call) => {
    const key = (call[0] as { queryKey?: unknown[] } | undefined)?.queryKey
    return Array.isArray(key) && key[0] === 'footer' && key[1] === tableId
  })
}

describe('remote row apply', () => {
  afterEach(() => {
    resetRealtimeApplyForTests()
    vi.useRealTimers()
  })

  it('applies the writer echo to a loaded row', () => {
    const client = new QueryClient()
    seed(client)
    applyRealtimeEvent(client, {
      id: '1',
      type: 'row.updated',
      actorId: 'me',
      projectId: 'project-1',
      tableId: 'table-1',
      row: echo(2, 'Grace'),
    }, 'me')
    expect(readName(client)?.cells.name).toBe('Grace')
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
    expect(readName(client)?.version).toBe(1)
    clearCellEditing()
    applyStashedCell(client, 'table-1', 'row-1', 'name')
    expect(readName(client)?.cells.name).toBe('Grace')
  })

  it('advances the version when the remote edit is a different cell', () => {
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
      cells: { name: 'Ada', city: 'Paris' },
      backgrounds: {},
    })
    expect(readName(client)?.version).toBe(4)
    expect(readName(client)?.cells.city).toBe('Paris')
    clearCellEditing()
  })

  it('keeps the local version when remote notes differ during an edit', () => {
    const client = new QueryClient()
    seed(client)
    setNotesEditing('row-1', true)
    applyRemoteRow(client, 'table-1', {
      id: 'row-1',
      position: 'a0',
      version: 5,
      color: null,
      notes: 'theirs',
      rowNumber: 1,
      cells: { name: 'Ada', city: 'London' },
      backgrounds: {},
    })
    expect(readName(client)?.notes).toBe('')
    expect(readName(client)?.version).toBe(1)
    setNotesEditing('row-1', false)
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

  it('skips the row list refetch after the writer echo and still refreshes the footer', () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    seed(client)
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    applyRealtimeEvent(
      client,
      { id: '1', type: 'row.updated', actorId: 'me', projectId: 'p1', tableId: 'table-1', row: echo(2, 'Grace') },
      'me',
    )
    applyRealtimeEvent(
      client,
      { id: '2', type: 'row.updated', actorId: 'me', projectId: 'p1', tableId: 'table-1', row: echo(3, 'Grace') },
      'me',
    )
    applyRealtimeEvent(
      client,
      { id: '3', type: 'rows.changed', actorId: 'me', projectId: 'p1', tableId: 'table-1' },
      'me',
    )
    vi.advanceTimersByTime(250)
    expect(invalidatedRows(invalidate, 'table-1')).toBe(false)
    expect(invalidatedFooter(invalidate, 'table-1')).toBe(true)
    expect(readName(client)?.cells.name).toBe('Grace')
  })

  it('refetches rows when the actor did not just patch a loaded row', () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    seed(client)
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    applyRealtimeEvent(
      client,
      { id: '1', type: 'rows.changed', actorId: 'me', projectId: 'p1', tableId: 'table-1' },
      'me',
    )
    vi.advanceTimersByTime(250)
    expect(invalidatedRows(invalidate, 'table-1')).toBe(true)
  })

  it('refetches when the echoed row is not loaded', () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    seed(client)
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    applyRealtimeEvent(
      client,
      { id: '1', type: 'row.updated', actorId: 'me', projectId: 'p1', tableId: 'table-1', row: echo(2, 'New', 'row-9') },
      'me',
    )
    applyRealtimeEvent(
      client,
      { id: '2', type: 'rows.changed', actorId: 'me', projectId: 'p1', tableId: 'table-1' },
      'me',
    )
    vi.advanceTimersByTime(250)
    expect(invalidatedRows(invalidate, 'table-1')).toBe(true)
    expect(readName(client)?.id).toBe('row-1')
  })

  it('keeps a newer cached row and still skips that save refetch', () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    seed(client)
    applyRemoteRow(client, 'table-1', echo(4, 'Newer'))
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    applyRealtimeEvent(
      client,
      { id: '1', type: 'row.updated', actorId: 'me', projectId: 'p1', tableId: 'table-1', row: echo(2, 'Stale') },
      'me',
    )
    applyRealtimeEvent(
      client,
      { id: '2', type: 'rows.changed', actorId: 'me', projectId: 'p1', tableId: 'table-1' },
      'me',
    )
    vi.advanceTimersByTime(250)
    expect(readName(client)?.cells.name).toBe('Newer')
    expect(readName(client)?.version).toBe(4)
    expect(invalidatedRows(invalidate, 'table-1')).toBe(false)
  })

  it('refetches a later structural change after the patch arm expires', () => {
    vi.useFakeTimers()
    const client = new QueryClient()
    seed(client)
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    applyRealtimeEvent(
      client,
      { id: '1', type: 'row.updated', actorId: 'me', projectId: 'p1', tableId: 'table-1', row: echo(2, 'Grace') },
      'me',
    )
    applyRealtimeEvent(
      client,
      { id: '2', type: 'rows.changed', actorId: 'me', projectId: 'p1', tableId: 'table-1' },
      'me',
    )
    applyRealtimeEvent(
      client,
      { id: '3', type: 'row.updated', actorId: 'me', projectId: 'p1', tableId: 'table-1', row: echo(3, 'After') },
      'me',
    )
    vi.advanceTimersByTime(1000)
    invalidate.mockClear()
    applyRealtimeEvent(
      client,
      { id: '4', type: 'rows.changed', actorId: 'me', projectId: 'p1', tableId: 'table-1' },
      'me',
    )
    vi.advanceTimersByTime(250)
    expect(invalidatedRows(invalidate, 'table-1')).toBe(true)
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

  it('refreshes relation titles when a table changes', async () => {
    const client = new QueryClient()
    client.setQueryData(['rows', 'companies', 'link'], { rows: [] })
    client.setQueryData(['rows', 'deals', '', null, ''], { pages: [], pageParams: [] })
    client.setQueryData(['footer', 'deals'], { footer: { sum: 1 } })
    applyRealtimeEvent(
      client,
      { id: '1', type: 'tables.changed', actorId: 'me', projectId: 'p1', tableId: 'companies' },
      'me',
    )
    await Promise.resolve()
    expect(client.getQueryState(['rows', 'companies', 'link'])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['rows', 'deals', '', null, ''])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['footer', 'deals'])?.isInvalidated).toBe(false)
  })
})
