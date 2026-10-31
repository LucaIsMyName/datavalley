import { describe, expect, it } from 'vitest'
import { paintSwatch, swatchName } from './colors.js'
import { parseCsv, toCsv } from './csv.js'
import { compareOp } from './filters.js'
import { conditionalStyle, expressionFromOperator, stylesForCell } from './formatting.js'
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

  it('uses the first true formula and lets a cell list replace the column', () => {
    const column = [
      { id: '1', scope: 'cell' as const, columnId: 'amount', expression: 'high', style: { background: '#bbf7d0' } },
      { id: '2', scope: 'cell' as const, columnId: 'amount', expression: 'low', style: { color: '#fecaca' } },
      { id: '3', scope: 'cell' as const, columnId: 'amount', operator: 'eq', value: 1, style: { bold: true } },
    ]
    const matches = (expression: string) => expression === 'low'
    expect(conditionalStyle(column, undefined, { amount: 1 }, 'amount', () => true)).toEqual({ background: '#bbf7d0' })
    expect(conditionalStyle(column, undefined, { amount: 1 }, 'amount', matches)).toEqual({ color: '#fecaca' })
    expect(conditionalStyle(column, [], { amount: 1 }, 'amount', () => false)).toEqual({ bold: true })
    expect(
      conditionalStyle(column, [{ id: 'c', scope: 'cell', columnId: 'amount', expression: 'no', style: { color: '#111111' } }], { amount: 1 }, 'amount', () => false),
    ).toEqual({})
    expect(
      conditionalStyle(column, [{ id: 'c', scope: 'cell', columnId: 'amount', expression: 'yes', style: { background: '#bfdbfe' } }], { amount: 1 }, 'amount', (expression) => expression === 'yes'),
    ).toEqual({ background: '#bfdbfe' })
  })

  it('resolves a palette name and a known hex', () => {
    expect(swatchName('Green')).toBe('green')
    expect(swatchName('#BBF7D0')).toBe('green')
    expect(swatchName('#112233')).toBeNull()
    expect(paintSwatch('green', 'background')).toBe('var(--swatch-green-bg)')
    expect(paintSwatch('#fecaca', 'text')).toBe('var(--swatch-red-fg)')
    expect(paintSwatch('#112233', 'background')).toBe('#112233')
    expect(paintSwatch(null, 'background')).toBeUndefined()
  })

  it('turns an operator rule into a formula condition', () => {
    expect(expressionFromOperator({ operator: 'eq', value: 1 })).toBe('IT = 1')
    expect(expressionFromOperator({ operator: 'gt', value: 'Open' })).toBe('IT > "Open"')
    expect(expressionFromOperator({ operator: 'contains', value: 'pha' })).toBe('CONTAINS(IT, "pha")')
    expect(expressionFromOperator({ operator: 'empty' })).toBe('ISBLANK(IT)')
    expect(expressionFromOperator({ operator: 'starts_with', value: 'Al' })).toBe('LEFT(IT, 2) = "Al"')
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
