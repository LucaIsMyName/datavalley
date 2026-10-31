import { describe, expect, it } from 'vitest'
import { tableRouteAfterDelete } from './table-delete'
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

describe('tableRouteAfterDelete', () => {
  it('returns the first remaining table in list order', () => {
    const tables = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(tableRouteAfterDelete(tables, 'b')).toEqual({ kind: 'table', tableId: 'a' })
    expect(tableRouteAfterDelete(tables, 'a')).toEqual({ kind: 'table', tableId: 'b' })
  })

  it('returns project when the deleted table was the only one', () => {
    expect(tableRouteAfterDelete([{ id: 'only' }], 'only')).toEqual({ kind: 'project' })
  })

  it('returns project when the list is already empty', () => {
    expect(tableRouteAfterDelete([], 'gone')).toEqual({ kind: 'project' })
  })
})
