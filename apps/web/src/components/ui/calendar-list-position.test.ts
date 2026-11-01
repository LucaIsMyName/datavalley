import { describe, expect, it } from 'vitest'
import { calendarListPosition } from './calendar-list-position.js'

describe('calendar list position', () => {
  it('opens downward when the month list fits below the button', () => {
    expect(calendarListPosition({ top: 100, bottom: 128, left: 40 }, 800)).toEqual({
      top: 132,
      left: 40,
      maxHeight: 320,
    })
  })

  it('opens upward when the bottom of the screen is closer than the top', () => {
    expect(calendarListPosition({ top: 700, bottom: 728, left: 12 }, 800)).toEqual({
      top: 376,
      left: 12,
      maxHeight: 320,
    })
  })
})
