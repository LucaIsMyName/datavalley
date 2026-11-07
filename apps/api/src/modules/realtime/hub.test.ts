import { describe, expect, it } from 'vitest'
import type { RealtimeEvent } from '@datavalley/shared'
import { createRealtimeHub, type RealtimeViewerConnection } from './hub.js'

function viewer(send: (event: RealtimeEvent) => void, canViewColumn: (tableId: string, columnId: string) => boolean = () => true): RealtimeViewerConnection {
  return {
    id: crypto.randomUUID(),
    userId: 'viewer',
    send,
    canViewTable: () => true,
    canViewColumn,
  }
}

describe('realtime hub', () => {
  it('delivers a row update and replays it after the last id', () => {
    const hub = createRealtimeHub({ sweepMs: 0 })
    const seen: RealtimeEvent[] = []
    hub.subscribe('project-1', viewer((event) => seen.push(event)))
    const published = hub.publish('project-1', {
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
        cells: { name: 'Ada' },
        backgrounds: {},
      },
    })
    expect(seen.map((event) => event.type)).toEqual(['row.updated'])
    expect(hub.since('project-1', published.id)).toEqual([])
    expect(hub.since('project-1', 'missing')).toEqual([])
    const earlier = hub.publish('project-1', { type: 'rows.changed', actorId: 'user-a', projectId: 'project-1', tableId: 'table-1' })
    expect(hub.since('project-1', published.id).map((event) => event.id)).toEqual([earlier.id])
  })

  it('omits a hidden column before send', () => {
    const hub = createRealtimeHub({ sweepMs: 0 })
    const seen: RealtimeEvent[] = []
    hub.subscribe('project-1', viewer((event) => seen.push(event), (_tableId, columnId) => columnId !== 'secret'))
    hub.publish('project-1', {
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
        cells: { name: 'Ada', secret: 'nope' },
        backgrounds: {},
      },
    })
    const event = seen[0]
    if (event?.type !== 'row.updated') throw new Error('expected row')
    expect(event.row.cells).toEqual({ name: 'Ada' })
  })

  it('drops a presence that has not been refreshed', () => {
    let clock = 1_000
    const hub = createRealtimeHub({ sweepMs: 0, now: () => clock })
    const seen: RealtimeEvent[] = []
    hub.subscribe('project-1', viewer((event) => seen.push(event)))
    hub.setPresence('project-1', {
      userId: 'user-b',
      username: 'bea',
      color: '#2563eb',
      tableId: 'table-1',
      tableName: 'People',
      focus: { kind: 'cell', tableId: 'table-1', rowId: 'row-1', columnId: 'name' },
      editing: true,
      draft: 'A',
    })
    expect(hub.people('project-1')).toHaveLength(1)
    clock += 10_001
    hub.sweep()
    expect(hub.people('project-1')).toEqual([])
    expect(seen.at(-1)).toMatchObject({ type: 'presence', remove: ['user-b'] })
  })
})
