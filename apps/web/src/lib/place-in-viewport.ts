export type ViewportAnchor = {
  left: number
  top: number
  right: number
  bottom: number
}

export type ViewportSize = {
  width: number
  height: number
}

type PlaceOptions = {
  prefer?: 'above' | 'below'
  align?: 'start' | 'end'
  gap?: number
  margin?: number
}

export function placeInViewport(
  anchor: ViewportAnchor,
  box: { width: number; height: number },
  viewport: ViewportSize,
  options: PlaceOptions = {},
): { top: number; left: number } {
  const prefer = options.prefer ?? 'above'
  const align = options.align ?? 'end'
  const gap = options.gap ?? 4
  const margin = options.margin ?? 8
  const needed = box.height + gap
  const spaceAbove = anchor.top - margin
  const spaceBelow = viewport.height - anchor.bottom - margin
  const fitsAbove = spaceAbove >= needed
  const fitsBelow = spaceBelow >= needed
  const placeAbove = prefer === 'above'
    ? fitsAbove || (!fitsBelow && spaceAbove >= spaceBelow)
    : (fitsAbove && !fitsBelow) || (!fitsAbove && !fitsBelow && spaceAbove > spaceBelow)

  let top = placeAbove ? anchor.top - gap - box.height : anchor.bottom + gap
  let left = align === 'end' ? anchor.right - box.width : anchor.left
  const maxLeft = viewport.width - margin - box.width
  const maxTop = viewport.height - margin - box.height
  if (left < margin) left = margin
  if (left > maxLeft) left = Math.max(margin, maxLeft)
  if (top < margin) top = margin
  if (top > maxTop) top = Math.max(margin, maxTop)
  return { top, left }
}

export function spaceBeside(
  anchor: ViewportAnchor,
  viewport: ViewportSize,
  options: { prefer?: 'above' | 'below'; margin?: number; gap?: number } = {},
): { prefer: 'above' | 'below'; maxHeight: number } {
  const margin = options.margin ?? 8
  const gap = options.gap ?? 4
  const above = Math.max(0, anchor.top - margin - gap)
  const below = Math.max(0, viewport.height - anchor.bottom - margin - gap)
  const prefer = options.prefer ?? 'below'
  const useAbove = prefer === 'above' ? above >= below : below < 160 && above > below
  const room = useAbove ? above : below
  const maxHeight = Math.max(120, Math.min(360, room || Math.max(above, below, 120)))
  return { prefer: useAbove ? 'above' : 'below', maxHeight }
}
