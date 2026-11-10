import { describe, expect, it } from 'vitest'
import { shouldCommitNodePosition } from './automation-drag'

describe('automation drag commit', () => {
  it('ignores a position change while the pointer is still down', () => {
    expect(shouldCommitNodePosition({ type: 'position', dragging: true, position: { x: 10, y: 20 } })).toBe(false)
  })

  it('saves a position change when the drag ends', () => {
    expect(shouldCommitNodePosition({ type: 'position', dragging: false, position: { x: 10, y: 20 } })).toBe(true)
  })
})
