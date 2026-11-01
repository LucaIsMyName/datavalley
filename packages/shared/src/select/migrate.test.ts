import { describe, expect, it } from 'vitest'
import { migrateSelectCell } from './migrate.js'

describe('migrateSelectCell', () => {
  it('single to multi wraps id', () => {
    expect(migrateSelectCell('opt-1', { multiple: true })).toEqual(['opt-1'])
    expect(migrateSelectCell(null, { multiple: true })).toEqual([])
  })

  it('multi to single takes first', () => {
    expect(migrateSelectCell(['a', 'b'], { multiple: false })).toBe('a')
    expect(migrateSelectCell([], { multiple: false })).toBeNull()
  })

  it('preserves shape when mode unchanged', () => {
    expect(migrateSelectCell('x', { multiple: false })).toBe('x')
    expect(migrateSelectCell(['x'], { multiple: true })).toEqual(['x'])
  })
})
