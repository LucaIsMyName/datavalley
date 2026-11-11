import { describe, expect, it } from 'vitest'
import { followKeyboardSelection } from './grid-follow'

const bounds = { rows: 50, columns: 4 }
const ready = { hasNextPage: true, isFetchingNextPage: false }

describe('keyboard selection follow', () => {
  it('moves down inside the loaded rows without fetching', () => {
    const result = followKeyboardSelection({
      key: 'ArrowDown',
      current: { row: 10, column: 1 },
      bounds,
      ...ready,
    })
    expect(result.next).toEqual({ row: 11, column: 1 })
    expect(result.scrollRow).toBe(11)
    expect(result.fetchNext).toBe(false)
  })

  it('fetches the next page when ArrowDown is already on the last loaded row', () => {
    const result = followKeyboardSelection({
      key: 'ArrowDown',
      current: { row: 49, column: 0 },
      bounds,
      ...ready,
    })
    expect(result.next).toEqual({ row: 49, column: 0 })
    expect(result.scrollRow).toBe(49)
    expect(result.fetchNext).toBe(true)
  })

  it('does not fetch from the last row when there is no next page or a fetch is running', () => {
    const current = { row: 49, column: 0 }
    expect(
      followKeyboardSelection({ key: 'ArrowDown', current, bounds, hasNextPage: false, isFetchingNextPage: false })
        .fetchNext,
    ).toBe(false)
    expect(
      followKeyboardSelection({ key: 'ArrowDown', current, bounds, hasNextPage: true, isFetchingNextPage: true })
        .fetchNext,
    ).toBe(false)
  })

  it('does not fetch for ArrowUp or horizontal keys', () => {
    const current = { row: 49, column: 1 }
    for (const key of ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'Tab', 'Shift+Tab']) {
      expect(followKeyboardSelection({ key, current, bounds, ...ready }).fetchNext).toBe(false)
    }
  })

  it('fetches when Enter lands on the last loaded row', () => {
    const result = followKeyboardSelection({
      key: 'Enter',
      current: { row: 48, column: 2 },
      bounds,
      ...ready,
    })
    expect(result.next).toEqual({ row: 49, column: 2 })
    expect(result.fetchNext).toBe(true)
  })
})
