import { describe, expect, it } from 'vitest'
import { orderMainColumnFirst, pinnedMainColumnId } from './grid-column-order'

const columns = [
  { id: 'a', hidden: false },
  { id: 'b', hidden: false },
  { id: 'c', hidden: true },
]

describe('main column order', () => {
  it('draws a visible main column first and leaves the stored order otherwise', () => {
    expect(orderMainColumnFirst(columns, 'b').map((column) => column.id)).toEqual(['b', 'a', 'c'])
    expect(orderMainColumnFirst(columns, 'a')).toBe(columns)
    expect(orderMainColumnFirst(columns, 'c')).toBe(columns)
    expect(orderMainColumnFirst(columns, null)).toBe(columns)
    expect(pinnedMainColumnId(columns, 'b')).toBe('b')
    expect(pinnedMainColumnId(columns, 'c')).toBeNull()
  })
})
