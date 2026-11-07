import { describe, expect, it } from 'vitest'
import { frameFromStorage } from './chat-frame.js'

describe('ask window frame', () => {
  const fallback = { x: 10, y: 20, width: 384, height: 512 }

  it('restores a saved frame and ignores a broken one', () => {
    expect(frameFromStorage({ x: 40, y: 50, width: 400, height: 420 }, fallback)).toMatchObject({ x: 40, y: 50, width: 400, height: 420 })
    expect(frameFromStorage({ x: '40' }, fallback)).toEqual(fallback)
    expect(frameFromStorage(null, fallback)).toEqual(fallback)
  })
})
