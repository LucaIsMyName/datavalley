import { describe, expect, it } from 'vitest'
import { columnHeaderClassName } from './grid-header'

describe('columnHeaderClassName', () => {
  it('marks a pinned column and keeps the card background', () => {
    expect(columnHeaderClassName(true, false, false, false)).toBe(
      'group relative h-10 overflow-visible px-2 text-left font-medium sticky z-20 bg-card  ',
    )
  })

  it('uses the accent background for a selected column and a ring for spotlight or ai', () => {
    expect(columnHeaderClassName(false, true, true, false)).toContain('bg-accent')
    expect(columnHeaderClassName(false, true, true, false)).toContain('ring-2 ring-inset ring-primary')
    expect(columnHeaderClassName(false, false, false, true)).toContain('ring-primary')
    expect(columnHeaderClassName(false, false, false, false)).not.toContain('ring-primary')
  })
})
