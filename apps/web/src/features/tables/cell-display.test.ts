import { describe, expect, it } from 'vitest'
import { relationDisplayLabel } from './cell-display'

describe('relation display', () => {
  it('shows the linked row name instead of its id', () => {
    expect(relationDisplayLabel('row-1', [], { rowId: 'row-1', title: 'Northwind' })).toBe('Northwind')
    expect(relationDisplayLabel('row-2', [{ id: 'row-2', title: 'Ada Lovelace' }], { rowId: 'row-1', title: 'Northwind' })).toBe(
      'Ada Lovelace',
    )
    expect(relationDisplayLabel('', [], { rowId: 'row-1', title: 'Northwind' })).toBe('')
    expect(relationDisplayLabel('row-3', [], undefined)).toBe('row-3')
  })
})