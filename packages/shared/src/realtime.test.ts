import { describe, expect, it } from 'vitest'
import { filterRealtimeEvent, presenceColor, type RealtimeEvent } from './realtime.js'

const open: Parameters<typeof filterRealtimeEvent>[1] = {
  canViewTable: () => true,
  canViewColumn: (_tableId, columnId) => columnId !== 'secret',
}

describe('presence color', () => {
  it('stays on the same color for a user', () => {
    expect(presenceColor('user-a')).toBe(presenceColor('user-a'))
    expect(presenceColor('user-a')).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('realtime event filter', () => {
  const rowEvent: RealtimeEvent = {
    id: '1',
    type: 'row.updated',
    actorId: 'user-a',
    projectId: 'project-1',
    tableId: 'table-1',
    row: {
      id: 'row-1',
      position: 'a0',
      version: 2,
      color: null,
      notes: '',
      rowNumber: 1,
      cells: { name: 'Ada', secret: 'hidden' },
      backgrounds: { secret: '#fff' },
      formats: {},
    },
  }

  it('drops a cell the viewer cannot see', () => {
    const filtered = filterRealtimeEvent(rowEvent, open)
    expect(filtered?.type).toBe('row.updated')
    if (filtered?.type !== 'row.updated') return
    expect(filtered.row.cells).toEqual({ name: 'Ada' })
    expect(filtered.row.backgrounds).toEqual({})
  })

  it('hides a table the viewer cannot open', () => {
    expect(filterRealtimeEvent(rowEvent, { canViewTable: () => false, canViewColumn: () => true })).toBeNull()
  })

  it('strips a draft on a hidden column and keeps the person', () => {
    const filtered = filterRealtimeEvent(
      {
        id: '2',
        type: 'presence',
        actorId: 'user-b',
        projectId: 'project-1',
        upsert: [
          {
            userId: 'user-b',
            username: 'bea',
            color: '#2563eb',
            tableId: 'table-1',
            tableName: 'People',
            focus: { kind: 'cell', tableId: 'table-1', rowId: 'row-1', columnId: 'secret' },
            editing: true,
            draft: 'nope',
          },
        ],
        remove: [],
      },
      open,
    )
    if (filtered?.type !== 'presence') throw new Error('expected presence')
    expect(filtered.upsert[0]).toMatchObject({ userId: 'user-b', tableName: 'People', focus: null, draft: null, editing: false })
  })
})
