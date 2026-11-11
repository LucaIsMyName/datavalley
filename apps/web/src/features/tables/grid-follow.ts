import { moveSelection, type CellAddress } from '@datavalley/shared'

/** Where a grid key should leave the selection, and whether that move needs another page. */
export function followKeyboardSelection(input: {
  key: string
  current: CellAddress
  bounds: { rows: number; columns: number }
  hasNextPage: boolean
  isFetchingNextPage: boolean
}): { next: CellAddress; scrollRow: number; fetchNext: boolean } {
  const next = moveSelection(input.current, input.key, input.bounds)
  const movesDown = input.key === 'ArrowDown' || input.key === 'Enter'
  const atEnd = next.row >= input.bounds.rows - 1
  const fetchNext = movesDown && atEnd && input.hasNextPage && !input.isFetchingNextPage
  return { next, scrollRow: next.row, fetchNext }
}
