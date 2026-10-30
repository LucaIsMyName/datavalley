import { describe, expect, it } from 'vitest'
import { FORMULA_HELP } from './formula-help'
import { insertSnippet, matchingFunctions } from './formula-insert'

describe('formula dialog', () => {
  it('inserts a function between the parentheses and filters the list by the typed name', () => {
    const inserted = insertSnippet('1+', 2, 2, 'SUM()')
    expect(inserted.value).toBe('1+SUM()')
    expect(inserted.value[inserted.cursor]).toBe(')')
    const matches = matchingFunctions('IF', 2).map((item) => item.name)
    expect(matches).toEqual(['IF', 'IFNOT', 'IFS'])
    expect(matchingFunctions('', 0)).toEqual(FORMULA_HELP)
  })
})