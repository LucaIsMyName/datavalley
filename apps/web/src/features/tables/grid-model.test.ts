import { describe, expect, it } from 'vitest'
import {
  activeFilter,
  filtersFrom,
  footerValue,
  moveIdBefore,
  nextLabel,
  operatorsFor,
} from './grid-model'

const stats = {
  count: 4,
  empty: 1,
  filled: 3,
  unique: 2,
  sum: 10 as number | null,
  avg: 1.236 as number | null,
  median: 2 as number | null,
  min: 1 as unknown,
  max: null as unknown,
}

describe('grid model', () => {
  it('builds an active filter from filled values', () => {
    expect(activeFilter({ title: { op: 'contains', value: '' } })).toBeNull()
    expect(activeFilter({ title: { op: 'empty', value: '' } })).toEqual({
      op: 'empty',
      columnId: 'title',
      value: '',
    })
    expect(
      activeFilter({
        title: { op: 'contains', value: 'a' },
        status: { op: 'not_empty', value: '' },
      }),
    ).toEqual({
      op: 'and',
      conditions: [
        { op: 'contains', columnId: 'title', value: 'a' },
        { op: 'not_empty', columnId: 'status', value: '' },
      ],
    })
  })

  it('reads filter nodes and skips nodes without a column', () => {
    expect(filtersFrom({ op: 'eq', columnId: 'title', value: 'a' })).toEqual({
      title: { op: 'eq', value: 'a' },
    })
    expect(
      filtersFrom({
        op: 'and',
        conditions: [
          { op: 'eq', columnId: 'title', value: null },
          { op: 'or', conditions: [] },
        ],
      }),
    ).toEqual({ title: { op: 'eq', value: '' } })
    expect(filtersFrom(null)).toEqual({})
  })

  it('picks operators for the column type', () => {
    expect(operatorsFor('number')).toEqual(['eq', 'gt', 'lt', 'empty', 'not_empty'])
    expect(operatorsFor('checkbox')).toEqual(['eq', 'empty', 'not_empty'])
    expect(operatorsFor('select')).toEqual(['eq', 'neq', 'empty', 'not_empty'])
    expect(operatorsFor('text')).toEqual(['eq', 'contains', 'starts_with', 'empty', 'not_empty'])
  })

  it('names copies and moves an id before another', () => {
    expect(nextLabel(['Name'], 'Name')).toBe('Name 2')
    expect(nextLabel(['Name', 'Name 2'], 'Name')).toBe('Name 3')
    expect(nextLabel([], 'Name')).toBe('Name')
    const ids = ['a', 'b', 'c']
    expect(moveIdBefore(ids, 'a', 'a')).toBe(ids)
    expect(moveIdBefore(ids, 'c', 'missing')).toBe(ids)
    expect(moveIdBefore(ids, 'c', 'a')).toEqual(['c', 'a', 'b'])
  })

  it('formats footer stats', () => {
    expect(footerValue('percent_empty', { ...stats, count: 0 })).toBe('0%')
    expect(footerValue('percent_filled', stats)).toBe('75%')
    expect(footerValue('sum', { ...stats, sum: null })).toBe('')
    expect(footerValue('sum', stats)).toBe('10')
    expect(footerValue('avg', stats)).toBe('1.24')
    expect(footerValue('min', { ...stats, min: null })).toBe('')
  })
})
