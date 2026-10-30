export type CellAddress = { row: number; column: number }

export function moveSelection(
  current: CellAddress,
  key: string,
  bounds: { rows: number; columns: number },
): CellAddress {
  const next = { ...current }
  if (key === 'ArrowUp') next.row -= 1
  if (key === 'ArrowDown') next.row += 1
  if (key === 'ArrowLeft') next.column -= 1
  if (key === 'ArrowRight') next.column += 1
  if (key === 'Tab') next.column += 1
  if (key === 'Enter') next.row += 1
  next.row = Math.max(0, Math.min(bounds.rows - 1, next.row))
  next.column = Math.max(0, Math.min(bounds.columns - 1, next.column))
  return next
}
