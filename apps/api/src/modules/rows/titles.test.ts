import { describe, expect, it } from 'vitest'
import { rowDisplayTitle, type TitleColumn } from './titles.js'

const amount: TitleColumn = { id: 'amount', type: 'number', name: 'Amount', position: 'a0' }
const name: TitleColumn = { id: 'name', type: 'text', name: 'Name', position: 'a1' }
const stage: TitleColumn = { id: 'stage', type: 'select', name: 'Stage', position: 'a0', options: [{ id: 'opt-won', label: 'Won' }] }

describe('row display title', () => {
  it('uses the main column, then name, then the first readable column, then the row id', () => {
    const labels = new Map<string, string>()
    expect(rowDisplayTitle([name, amount], { name: 'Ada', amount: 12 }, labels, 'row-1', 'amount')).toBe('12')
    expect(rowDisplayTitle([amount, name], { name: 'Ada', amount: null }, labels, 'row-1', 'amount')).toBe('Ada')
    expect(rowDisplayTitle([amount, name], { name: '', amount: 42 }, labels, 'row-1')).toBe('42')
    expect(rowDisplayTitle([stage], { stage: 'opt-won' }, labels, 'row-1')).toBe('Won')
    expect(rowDisplayTitle([name], { name: '' }, labels, 'row-1')).toBe('row-1')
  })
})