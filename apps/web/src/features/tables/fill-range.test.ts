import { describe, expect, it } from 'vitest'
import { fillTargets } from './fill-range'

const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

describe('fill targets', () => {
  it('copies downward and skips the source cell', () => {
    expect(fillTargets(rows, 0, 2, true)).toEqual(['b', 'c'])
  })

  it('copies upward and skips the source cell', () => {
    expect(fillTargets(rows, 2, 0, true)).toEqual(['a', 'b'])
  })

  it('returns nothing for a formula column or a drag that stays on the source', () => {
    expect(fillTargets(rows, 1, 3, false)).toEqual([])
    expect(fillTargets(rows, 1, 1, true)).toEqual([])
  })
})
