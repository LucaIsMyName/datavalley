import { describe, expect, it } from 'vitest'
import { monthToShowAfterRangeSelect } from './date-picker-month.js'

describe('month after a range selection', () => {
  it('stays on the day that was clicked when the range ends in another month', () => {
    const clicked = new Date(2024, 11, 15)
    const shown = monthToShowAfterRangeSelect(clicked, {
      from: clicked,
      to: new Date(2026, 10, 8),
    })
    expect(shown).toBe(clicked)
  })
})
