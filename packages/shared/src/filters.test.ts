import { describe, expect, it } from 'vitest'
import { filterOperatorsFor } from './filters.js'

describe('filterOperatorsFor', () => {
  it('allows number comparisons the grid menu hides', () => {
    expect(filterOperatorsFor('number')).toEqual(['eq', 'neq', 'gt', 'lt', 'between', 'empty', 'not_empty'])
    expect(filterOperatorsFor('currency')).toEqual(filterOperatorsFor('date'))
    expect(filterOperatorsFor('datetime')).toEqual(filterOperatorsFor('number'))
  })

  it('keeps choice, checkbox, and catalog operators', () => {
    expect(filterOperatorsFor('checkbox')).toEqual(['eq', 'empty', 'not_empty'])
    expect(filterOperatorsFor('select')).toEqual(['eq', 'neq', 'empty', 'not_empty'])
    expect(filterOperatorsFor('relation')).toEqual(filterOperatorsFor('multi_select'))
    expect(filterOperatorsFor('tags')).toEqual(['eq', 'neq', 'empty', 'not_empty'])
    expect(filterOperatorsFor('user')).toEqual(filterOperatorsFor('status'))
  })

  it('limits computed columns to empty checks and leaves text wide', () => {
    expect(filterOperatorsFor('formula')).toEqual(['empty', 'not_empty'])
    expect(filterOperatorsFor('lookup')).toEqual(filterOperatorsFor('media'))
    expect(filterOperatorsFor('row_id')).toEqual(filterOperatorsFor('formula'))
    expect(filterOperatorsFor('text')).toEqual([
      'eq',
      'neq',
      'contains',
      'not_contains',
      'starts_with',
      'ends_with',
      'empty',
      'not_empty',
      'gt',
      'lt',
      'between',
    ])
    expect(filterOperatorsFor('long_text')).toEqual(filterOperatorsFor('text'))
  })
})
