import { describe, expect, it } from 'vitest'
import { beforeDropEdge, tabDropEdge } from './drop-place'

describe('drop place', () => {
  const ids = ['a', 'b', 'c']

  it('marks the gap a dragged tab will occupy', () => {
    expect(tabDropEdge(ids, 'c', 'a')).toBe('before')
    expect(tabDropEdge(ids, 'a', 'c')).toBe('after')
    expect(tabDropEdge(ids, 'a', 'a')).toBeNull()
    expect(tabDropEdge(ids, 'missing', 'a')).toBeNull()
  })

  it('marks the leading edge when an item moves in front of another', () => {
    expect(beforeDropEdge(ids, 'a', 'c')).toBe('before')
    expect(beforeDropEdge(ids, 'c', 'a')).toBe('before')
    expect(beforeDropEdge(ids, 'b', 'c')).toBeNull()
    expect(beforeDropEdge(ids, 'a', 'a')).toBeNull()
  })
})