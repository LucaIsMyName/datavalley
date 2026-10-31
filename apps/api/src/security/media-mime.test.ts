import { describe, expect, it } from 'vitest'
import { sniffMediaMime } from './media-mime.js'

describe('sniffMediaMime', () => {
  it('accepts a PNG when magic bytes match', () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(sniffMediaMime(buffer, 'image/png')).toBe('image/png')
  })

  it('rejects a PNG declaration when bytes do not match', () => {
    expect(sniffMediaMime(Buffer.from('not-a-png'), 'image/png')).toBeNull()
  })

  it('rejects binary content declared as plain text', () => {
    expect(sniffMediaMime(Buffer.from([0x00, 0x01, 0x02]), 'text/plain')).toBeNull()
  })
})
