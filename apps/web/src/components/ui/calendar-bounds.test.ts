import { describe, expect, it } from 'vitest'
import { calendarBounds } from './calendar-bounds.js'

describe('calendar bounds', () => {
  it('covers a hundred years before and after the given day', () => {
    const bounds = calendarBounds(new Date(2026, 10, 1))
    expect(bounds.startMonth.getFullYear()).toBe(1926)
    expect(bounds.startMonth.getMonth()).toBe(0)
    expect(bounds.endMonth.getFullYear()).toBe(2126)
    expect(bounds.endMonth.getMonth()).toBe(11)
  })
})
