import { describe, expect, it } from 'vitest'
import { kanbanLanes } from './kanban-board'

describe('kanbanLanes', () => {
  const options = [
    { id: 'new', label: 'New' },
    { id: 'won', label: 'Won' },
  ]

  it('groups rows by status and keeps a lane for rows without one', () => {
    const lanes = kanbanLanes(
      [
        { id: 'a', status: 'won' },
        { id: 'b', status: null },
        { id: 'c', status: 'missing' },
      ],
      options,
      ['won', 'new'],
    )
    expect(lanes.map((lane) => lane.id)).toEqual(['won', 'new', ''])
    expect(lanes[0]?.rowIds).toEqual(['a'])
    expect(lanes[2]?.rowIds).toEqual(['b', 'c'])
  })
})
