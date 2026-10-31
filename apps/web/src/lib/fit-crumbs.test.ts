import { describe, expect, it } from 'vitest'
import { fitCrumbs } from './fit-crumbs.js'

describe('fitCrumbs', () => {
  it('keeps the full trail when it fits', () => {
    expect(fitCrumbs([40, 40, 40], 120, 28)).toEqual([0, 1, 2])
  })

  it('collapses leading crumbs into the menu', () => {
    expect(fitCrumbs([100, 100, 100], 250, 40)).toEqual([1, 2])
  })

  it('keeps only the current crumb when nothing else fits', () => {
    expect(fitCrumbs([100, 100, 100], 120, 40)).toEqual([2])
  })

  it('leaves a too-long current crumb as the one on screen', () => {
    expect(fitCrumbs([40, 400], 100, 28)).toEqual([1])
  })
})
