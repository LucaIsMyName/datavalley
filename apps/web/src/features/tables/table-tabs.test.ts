import { describe, expect, it } from 'vitest'
import { moveTab, tableNameFromFile } from './table-tabs'

describe('table tabs', () => {
  it('moves a tab in front of another tab', () => {
    const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(moveTab(tabs, 'c', 'a').map((tab) => tab.id)).toEqual(['c', 'a', 'b'])
    expect(moveTab(tabs, 'a', 'c').map((tab) => tab.id)).toEqual(['b', 'c', 'a'])
    expect(moveTab(tabs, 'a', 'a')).toBe(tabs)
  })

  it('uses the file name without the csv suffix', () => {
    expect(tableNameFromFile('Customers.csv')).toBe('Customers')
    expect(tableNameFromFile('People.CSV')).toBe('People')
    expect(tableNameFromFile('notes')).toBe('notes')
  })
})
