import { describe, expect, it } from 'vitest'
import type { Column, RowRecord } from '@datavalley/api-client'
import { buildNoteFieldLines, formatNoteCellValue } from './note-fields.js'

const column = (partial: Partial<Column> & Pick<Column, 'id' | 'name' | 'type'>): Column =>
  ({
    width: 120,
    position: 'a',
    hidden: false,
    config: {},
    options: [],
    ...partial,
  }) as Column

describe('formatNoteCellValue', () => {
  it('formats checkbox as yes/no', () => {
    const col = column({ id: 'c1', name: 'Paid', type: 'checkbox' })
    expect(
      formatNoteCellValue(col, true, 'en', { tags: [], statuses: [], members: [] }, {
        yes: 'Yes',
        no: 'No',
        mediaCount: () => '',
      }),
    ).toBe('Yes')
  })

  it('formats select options by label', () => {
    const col = column({
      id: 'c1',
      name: 'Status',
      type: 'select',
      options: [{ id: 'o1', label: 'Open', color: null, position: 'a' }],
    })
    expect(
      formatNoteCellValue(col, 'o1', 'en', { tags: [], statuses: [], members: [] }, {
        yes: 'Yes',
        no: 'No',
        mediaCount: () => '',
      }),
    ).toBe('Open')
  })
})

describe('buildNoteFieldLines', () => {
  it('lists every column with em dash for empty', () => {
    const columns = [
      column({ id: 'n', name: 'Name', type: 'text' }),
      column({ id: 'm', name: 'Mail', type: 'text' }),
    ]
    const row: RowRecord = {
      id: 'r1',
      rowNumber: 1,
      position: 'a',
      version: 1,
      color: null,
      notes: '',
      cells: { n: 'John', m: '' },
      backgrounds: {},
      formats: {},
    }
    const lines = buildNoteFieldLines(columns, row, 'en', { tags: [], statuses: [], members: [] }, {
      yes: 'Yes',
      no: 'No',
      empty: '—',
      mediaCount: (count) => `${count} files`,
    })
    expect(lines).toEqual([
      { name: 'Name', value: 'John' },
      { name: 'Mail', value: '—' },
    ])
  })
})
