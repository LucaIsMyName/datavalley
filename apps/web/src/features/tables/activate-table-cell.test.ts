import type { Column, RowRecord } from '@datavalley/api-client'
import { describe, expect, it, vi } from 'vitest'
import { activateTableCell } from './activate-table-cell.js'

const column = (type: string): Column =>
  ({
    id: 'c1',
    name: 'Field',
    type,
    width: 100,
    position: 'a',
    hidden: false,
    config: {},
    options: [],
  }) as unknown as Column

const row: RowRecord = {
  id: 'r1',
  rowNumber: 1,
  position: 'a',
  version: 1,
  color: null,
  notes: '',
  cells: {},
  backgrounds: {},
  formats: {},
}

describe('activateTableCell', () => {
  it('opens formula instead of inline edit', () => {
    const onOpenFormula = vi.fn()
    const onBeginEdit = vi.fn()
    activateTableCell({
      row,
      column: column('formula'),
      readOnly: false,
      onOpenFormula,
      onBeginEdit,
    })
    expect(onOpenFormula).toHaveBeenCalledWith(row, column('formula'))
    expect(onBeginEdit).not.toHaveBeenCalled()
  })

  it('begins edit for text columns', () => {
    const onOpenFormula = vi.fn()
    const onBeginEdit = vi.fn()
    activateTableCell({
      row,
      column: column('text'),
      readOnly: false,
      onOpenFormula,
      onBeginEdit,
    })
    expect(onBeginEdit).toHaveBeenCalledWith('c1')
    expect(onOpenFormula).not.toHaveBeenCalled()
  })

  it('skips checkbox columns', () => {
    const onOpenFormula = vi.fn()
    const onBeginEdit = vi.fn()
    activateTableCell({
      row,
      column: column('checkbox'),
      readOnly: false,
      onOpenFormula,
      onBeginEdit,
    })
    expect(onOpenFormula).not.toHaveBeenCalled()
    expect(onBeginEdit).not.toHaveBeenCalled()
  })
})
