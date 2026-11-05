import { describe, expect, it } from 'vitest'
import {
  columnFeedsFooter,
  columnHasFormatRules,
  editingAfterRelease,
  invalidSignatureFor,
} from './grid-edit.js'

describe('cell edit release', () => {
  it('clears editing only for the cell that finished', () => {
    expect(editingAfterRelease('row-a:col-a', 'row-a:col-a')).toBeNull()
    expect(editingAfterRelease('row-b:col-b', 'row-a:col-a')).toBe('row-b:col-b')
    expect(editingAfterRelease(null, 'row-a:col-a')).toBeNull()
  })

  it('refreshes the footer only for a column the footer aggregates', () => {
    const footer = { enabled: true, columns: { amount: 'sum', name: '' } }
    expect(columnFeedsFooter(footer, 'amount')).toBe(true)
    expect(columnFeedsFooter(footer, 'name')).toBe(false)
    expect(columnFeedsFooter(footer, 'other')).toBe(false)
    expect(columnFeedsFooter({ enabled: false, columns: { amount: 'sum' } }, 'amount')).toBe(false)
    expect(columnFeedsFooter(null, 'amount')).toBe(false)
  })

  it('describes invalid cells and format rules for one row', () => {
    expect(
      invalidSignatureFor('row-1', {
        'cell:row-1:name': { message: 'Required' },
        'cell:row-2:name': { message: 'Other' },
      }),
    ).toBe('cell:row-1:name=Required|')
    expect(columnHasFormatRules([], undefined, 'name')).toBe(false)
    expect(columnHasFormatRules([{ columnId: 'amount' }], undefined, 'name')).toBe(false)
    expect(columnHasFormatRules([{ columnId: 'name' }], undefined, 'name')).toBe(true)
    expect(columnHasFormatRules([], [{ expression: '1' }], 'name')).toBe(true)
  })
})
