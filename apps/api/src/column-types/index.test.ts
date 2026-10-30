import { describe, expect, it } from 'vitest'
import { coerceImport, parseCell, readCell, type ColumnShape } from './index.js'

const text: ColumnShape = { id: 'c', name: 'Name', type: 'text', config: {} }
const amount: ColumnShape = { id: 'n', name: 'Amount', type: 'number', config: {} }
const status: ColumnShape = {
  id: 's',
  name: 'Status',
  type: 'select',
  config: {},
  options: [{ id: 'opt-1', label: 'Open', color: null, position: 'a' }],
}

describe('column types', () => {
  it('parses text, numbers, and select labels', () => {
    expect(readCell(text, parseCell(text, 'Ada')!)).toBe('Ada')
    expect(readCell(amount, parseCell(amount, '12.5')!)).toBe(12.5)
    expect(readCell(status, coerceImport(status, 'open')!)).toBe('opt-1')
    expect(parseCell(text, '')).toBeNull()
  })

  it('rejects an invalid URL and an unknown option', () => {
    const url: ColumnShape = { id: 'u', name: 'Site', type: 'url', config: {} }
    expect(() => parseCell(url, 'notaurl')).toThrow(/URL/)
    expect(() => coerceImport(status, 'missing')).toThrow(/Unknown option/)
  })

  it('stores an email address and rejects a value that is not one', () => {
    const mail: ColumnShape = { id: 'm', name: 'Mail', type: 'mail', config: {} }
    expect(readCell(mail, parseCell(mail, 'john@doe.com')!)).toBe('john@doe.com')
    expect(() => parseCell(mail, 'john')).toThrow(/email/)
  })
})
