import { describe, expect, it } from 'vitest'
import { aiControlsVisible } from './status.js'
import { aiColumnKey, useAiHighlight } from './highlight-store.js'
import { cellWritePlan } from './proposals.js'
import type { AiCellProposal } from '@datavalley/shared'

const proposal = (changes: AiCellProposal['changes']): AiCellProposal => ({
  kind: 'cells',
  tableId: 'table-1',
  projectId: 'project-1',
  changes,
})

describe('ai controls', () => {
  it('stays hidden until status says AI is on', () => {
    expect(aiControlsVisible(undefined)).toBe(false)
    expect(aiControlsVisible({ enabled: false })).toBe(false)
    expect(aiControlsVisible({ enabled: true })).toBe(true)
  })

  it('keeps highlights out of the row and column spotlight address', () => {
    useAiHighlight.getState().clear()
    useAiHighlight.getState().setMarks({
      tableId: 'table-1',
      cells: [{ rowId: 'row-1', columnId: 'col-1' }],
      rowIds: ['row-2'],
      columnIds: ['col-2'],
    })
    expect(useAiHighlight.getState().tableId).toBe('table-1')
    expect(aiColumnKey(useAiHighlight.getState(), 'table-1', 'row-1')).toBe('col-1,col-2')
    expect(aiColumnKey(useAiHighlight.getState(), 'other', 'row-1')).toBe('')
    expect(useAiHighlight.getState()).not.toHaveProperty('search')
    useAiHighlight.getState().clear()
    expect(useAiHighlight.getState().tableId).toBeNull()
  })

  it('sends one cell through the row route and many cells through bulk', () => {
    const one = cellWritePlan(
      proposal([{ rowId: 'row-1', columnId: 'col-1', value: 'Ada', version: 3, rowLabel: '#1', columnName: 'Name', before: '' }]),
    )
    expect(one.path).toBe('/rows/row-1')
    expect(one.body).toEqual({ version: 3, cells: { 'col-1': 'Ada' } })
    const many = cellWritePlan(
      proposal([
        { rowId: 'row-1', columnId: 'col-1', value: 'Ada', version: 3, rowLabel: '#1', columnName: 'Name', before: '' },
        { rowId: 'row-1', columnId: 'col-2', value: 'ada@example.com', version: 3, rowLabel: '#1', columnName: 'Mail', before: '' },
      ]),
    )
    expect(many.path).toBe('/tables/table-1/cells/bulk')
    expect(many.body).toEqual({
      updates: [{ rowId: 'row-1', version: 3, cells: { 'col-1': 'Ada', 'col-2': 'ada@example.com' } }],
    })
  })
})
