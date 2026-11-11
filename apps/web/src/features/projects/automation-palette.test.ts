import { describe, expect, it } from 'vitest'
import { paletteStepPosition } from './automation-palette'

describe('automation palette position', () => {
  it('starts an empty flow away from the origin', () => {
    expect(paletteStepPosition([])).toEqual({ x: 80, y: 80 })
  })

  it('places the next step under the lowest node', () => {
    expect(
      paletteStepPosition([
        { position: { x: 40, y: 40 } },
        { position: { x: 200, y: 180 } },
      ]),
    ).toEqual({ x: 80, y: 320 })
  })
})
