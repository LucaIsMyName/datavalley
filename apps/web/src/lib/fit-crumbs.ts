export function fitCrumbs(widths: number[], available: number, menuWidth: number): number[] {
  if (widths.length === 0) return []
  const total = widths.reduce((sum, width) => sum + width, 0)
  if (total <= available) return widths.map((_, index) => index)

  const last = widths.length - 1
  const visible = [last]
  let used = widths[last] ?? 0
  for (let index = last - 1; index >= 0; index -= 1) {
    const menu = index > 0 ? menuWidth : 0
    if (used + widths[index] + menu <= available) {
      visible.unshift(index)
      used += widths[index]
    } else {
      break
    }
  }

  if (visible.length < widths.length) {
    let withMenu = used + menuWidth
    while (withMenu > available && visible.length > 1) {
      const removed = visible.shift()
      if (removed === undefined) break
      withMenu -= widths[removed] ?? 0
    }
  }
  return visible
}
