import { describe, expect, it } from 'vitest'
import type { Column } from '@datavalley/api-client'
import { copyCellText, displayCellValue } from './cell-display.js'

const column = (partial: Partial<Column> & Pick<Column, 'id' | 'name' | 'type'>): Column =>
  ({
    width: 120,
    position: 'a',
    hidden: false,
    config: {},
    options: [],
    ...partial,
  }) as Column

const labels = {
  yes: 'Yes',
  no: 'No',
  mediaCount: (count: number) => `${count} files`,
}

describe('displayCellValue', () => {
  it('formats currency with the runtime locale and keeps the raw number for copy', () => {
    const col = column({ id: 'c1', name: 'Price', type: 'currency', config: { currency: 'USD' } })
    const expected = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(12.5)
    expect(displayCellValue(col, 12.5, 'en')).toBe(expected)
    expect(copyCellText(col, 12.5, 'en')).toBe('12.5')
  })

  it('truncates integer number variants', () => {
    const col = column({ id: 'c1', name: 'Qty', type: 'number', config: { variant: 'integer' } })
    expect(displayCellValue(col, 3.9, 'en')).toBe('3')
  })

  it('labels select options from the column', () => {
    const col = column({
      id: 'c1',
      name: 'Stage',
      type: 'select',
      options: [{ id: 'o1', label: 'Open', color: null, position: 'a' }],
    })
    expect(displayCellValue(col, 'o1', 'en')).toBe('Open')
  })

  it('labels status, tags, and users only when catalogs are passed', () => {
    const status = column({ id: 's', name: 'Status', type: 'status' })
    const tags = column({ id: 't', name: 'Tags', type: 'tags' })
    const user = column({ id: 'u', name: 'Owner', type: 'user' })
    expect(displayCellValue(status, 'st1', 'en')).toBe('st1')
    expect(displayCellValue(status, 'st1', 'en', { statuses: [{ id: 'st1', name: 'Done' }] })).toBe('Done')
    expect(displayCellValue(tags, ['t1', 't2'], 'en', { tags: [{ id: 't1', name: 'A' }, { id: 't2', name: 'B' }] })).toBe('A, B')
    expect(displayCellValue(user, ['u1'], 'en', { members: [{ id: 'u1', name: 'Ada' }] })).toBe('Ada')
  })

  it('uses checkbox and media labels only when they are passed', () => {
    const checkbox = column({ id: 'c', name: 'Paid', type: 'checkbox' })
    const media = column({ id: 'm', name: 'Files', type: 'media' })
    expect(displayCellValue(checkbox, true, 'en')).toBe('TRUE')
    expect(displayCellValue(checkbox, false, 'en', { labels })).toBe('No')
    expect(displayCellValue(media, { fileIds: ['a', 'b'] }, 'en')).toBe('')
    expect(displayCellValue(media, { fileIds: ['a', 'b'] }, 'en', { labels })).toBe('2 files')
  })

  it('renders formula errors and empty values', () => {
    const formula = column({ id: 'f', name: 'Calc', type: 'formula' })
    expect(displayCellValue(formula, { error: '#REF' }, 'en')).toBe('#REF')
    expect(displayCellValue(formula, null, 'en')).toBe('')
  })
})
