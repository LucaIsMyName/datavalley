import { describe, expect, it } from 'vitest'
import { FORMULA_HELP } from './formula-help'
import { aggregateReference, cellReference, insertSnippet, lookupReference, matchingFunctions, relationReference, thisRowReference } from './formula-insert'

describe('formula dialog', () => {
  it('inserts a function between the parentheses and filters the list by the typed name', () => {
    const inserted = insertSnippet('1+', 2, 2, 'SUM()')
    expect(inserted.value).toBe('1+SUM()')
    expect(inserted.value[inserted.cursor]).toBe(')')
    const matches = matchingFunctions('IF', 2).map((item) => item.name)
    expect(matches).toEqual(['IF', 'IFNOT', 'IFS'])
    expect(matchingFunctions('', 0)).toEqual(FORMULA_HELP)
  })

  it('inserts a bracket for this row, one cell, a link, a whole column, and a lookup', () => {
    expect(thisRowReference('Column copy')).toBe('[Column copy]')
    expect(cellReference('People', 'Column copy', 15)).toBe('[People -> Column copy -> #15]')
    expect(relationReference('Customer', 'Price')).toBe('[Customer -> Price]')
    expect(aggregateReference('SUM', 'People', 'Column copy')).toBe('SUM([People -> Column copy])')
    expect(lookupReference('People', 'Mail', 'Email', 'People', 'Name')).toBe('LOOKUP([People -> Mail], [Email], [People -> Name])')
  })
})