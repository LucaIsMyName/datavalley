import { describe, expect, it } from 'vitest'
import { mergeColumnOption, sortOptionsByPosition } from './select-options-utils.js'

describe('select options utils', () => {
  it('sorts by fractional position', () => {
    const sorted = sortOptionsByPosition([
      { id: 'b', label: 'B', color: null, position: 'b' },
      { id: 'a', label: 'A', color: null, position: 'a' },
    ])
    expect(sorted.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('merges and removes options on a column', () => {
    const column = {
      id: 'c1',
      options: [{ id: 'a', label: 'A', color: null, position: 'a' }],
    } as never
    const merged = mergeColumnOption(column, { id: 'b', label: 'B', color: 'blue', position: 'b' })
    expect(merged.options.map((item) => item.id)).toEqual(['a', 'b'])
    const removed = mergeColumnOption(merged, { id: 'a', label: 'A', color: null, position: 'a' }, true)
    expect(removed.options.map((item) => item.id)).toEqual(['b'])
  })
})
