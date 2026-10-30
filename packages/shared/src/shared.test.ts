import { describe, expect, it } from 'vitest'
import { parseCsv, toCsv } from './csv.js'
import { compareOp } from './filters.js'
import { stylesForCell } from './formatting.js'
import { decide } from './permissions.js'
import { moveSelection } from './selection.js'
import { createUndoStack } from './undo.js'

describe('permissions', () => {
  const project = 'p1'
  const table = 't1'
  const row = 'r1'

  it('inherits an allow from the project when the row has no grant', () => {
    const allowed = decide(
      [{ resourceType: 'project', resourceId: project, action: 'view', effect: 'allow' }],
      'view',
      { type: 'row', id: row, parents: { table, project } },
    )
    expect(allowed).toBe(true)
  })

  it('lets a more specific deny override an inherited allow', () => {
    const allowed = decide(
      [
        { resourceType: 'project', resourceId: project, action: 'edit', effect: 'allow' },
        { resourceType: 'row', resourceId: row, action: 'edit', effect: 'deny' },
      ],
      'edit',
      { type: 'row', id: row, parents: { table, project } },
    )
    expect(allowed).toBe(false)
  })

  it('denies when nothing is granted', () => {
    expect(decide([], 'view', { type: 'project', id: project })).toBe(false)
  })

  it('lets deny win over allow at the same level', () => {
    const allowed = decide(
      [
        { resourceType: 'table', resourceId: table, action: 'view', effect: 'allow' },
        { resourceType: 'table', resourceId: table, action: 'view', effect: 'deny' },
      ],
      'view',
      { type: 'table', id: table, parents: { project } },
    )
    expect(allowed).toBe(false)
  })
})

describe('formatting and filters', () => {
  it('matches comparison rules against already loaded cell values', () => {
    const style = stylesForCell(
      [
        {
          id: '1',
          scope: 'cell',
          columnId: 'status',
          operator: 'eq',
          value: 'Completed',
          style: { background: 'green', bold: true },
        },
        {
          id: '2',
          scope: 'row',
          columnId: 'amount',
          operator: 'gt',
          value: 100,
          style: { color: 'red' },
        },
      ],
      { status: 'Completed', amount: 150 },
      'status',
    )
    expect(style).toEqual({ background: 'green', bold: true, color: 'red' })
  })

  it('supports the spreadsheet comparison operators', () => {
    expect(compareOp('contains', 'Alphabet', 'pha')).toBe(true)
    expect(compareOp('starts_with', 'Alphabet', 'Al')).toBe(true)
    expect(compareOp('ends_with', 'Alphabet', 'bet')).toBe(true)
    expect(compareOp('between', 5, 1, 10)).toBe(true)
    expect(compareOp('empty', null)).toBe(true)
    expect(compareOp('not_empty', 'x')).toBe(true)
    expect(compareOp('neq', 'a', 'b')).toBe(true)
  })
})

describe('csv', () => {
  it('round-trips quoted commas and newlines', () => {
    const rows = [
      ['name', 'note'],
      ['Ada', 'hello, world'],
      ['Grace', 'line\nbreak'],
    ]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
})

describe('grid helpers', () => {
  it('keeps selection inside the grid', () => {
    expect(moveSelection({ row: 0, column: 0 }, 'ArrowUp', { rows: 2, columns: 2 })).toEqual({
      row: 0,
      column: 0,
    })
    expect(moveSelection({ row: 0, column: 0 }, 'ArrowRight', { rows: 2, columns: 2 })).toEqual({
      row: 0,
      column: 1,
    })
  })

  it('caps the undo stack at 50 commands', () => {
    const stack = createUndoStack<number>(50)
    for (let i = 0; i < 60; i++) stack.push({ undo: i, redo: i })
    expect(stack.size).toBe(50)
    expect(stack.popUndo()?.undo).toBe(59)
    expect(stack.popRedo()?.redo).toBe(59)
  })
})
