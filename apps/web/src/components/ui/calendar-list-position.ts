const listHeight = 320

export function calendarListPosition(
  anchor: { top: number; bottom: number; left: number },
  viewportHeight: number,
  height = listHeight,
) {
  const spaceBelow = viewportHeight - anchor.bottom
  const spaceAbove = anchor.top
  const openUp = spaceBelow < height && spaceAbove > spaceBelow
  const maxHeight = Math.max(32, Math.min(height, (openUp ? spaceAbove : spaceBelow) - 8))
  const top = openUp ? Math.max(8, anchor.top - maxHeight - 4) : anchor.bottom + 4
  return { top, left: anchor.left, maxHeight }
}
