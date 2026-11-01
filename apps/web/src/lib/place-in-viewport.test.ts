import { describe, expect, it } from 'vitest'
import { placeInViewport, spaceBeside } from './place-in-viewport.js'

const viewport = { width: 800, height: 600 }

describe('placeInViewport', () => {
  it('places the box above the anchor when there is room', () => {
    expect(placeInViewport(
      { left: 100, top: 200, right: 140, bottom: 220 },
      { width: 80, height: 40 },
      viewport,
    )).toEqual({ top: 156, left: 60 })
  })

  it('flips below when the anchor is near the top', () => {
    const placed = placeInViewport(
      { left: 100, top: 10, right: 140, bottom: 28 },
      { width: 80, height: 40 },
      viewport,
    )
    expect(placed.top).toBe(32)
  })

  it('shifts in from the right edge', () => {
    const placed = placeInViewport(
      { left: 720, top: 200, right: 760, bottom: 220 },
      { width: 200, height: 40 },
      viewport,
      { align: 'start' },
    )
    expect(placed.left).toBe(592)
  })

  it('shifts in from the left edge', () => {
    const placed = placeInViewport(
      { left: 4, top: 200, right: 20, bottom: 220 },
      { width: 100, height: 40 },
      viewport,
    )
    expect(placed.left).toBe(8)
  })

  it('keeps a tall popover beside the anchor instead of the top of the viewport', () => {
    const space = spaceBeside(
      { left: 100, top: 420, right: 220, bottom: 456 },
      viewport,
      { prefer: 'below' },
    )
    expect(space.prefer).toBe('above')
    expect(space.maxHeight).toBeLessThanOrEqual(360)
    expect(space.maxHeight).toBeGreaterThan(120)
  })
})
