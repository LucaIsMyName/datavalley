import { describe, expect, it } from 'vitest'
import { formatMediaBytes, isPdfMime, isRasterImageMime, mediaDownloadUrl } from './media'

describe('media helpers', () => {
  it('builds same-origin download URLs', () => {
    expect(mediaDownloadUrl('abc')).toBe('/api/v1/media/abc')
  })

  it('formats byte sizes', () => {
    expect(formatMediaBytes(512)).toBe('512 B')
    expect(formatMediaBytes(2048)).toBe('2.0 KB')
  })

  it('treats raster images separately from SVG', () => {
    expect(isRasterImageMime('image/png')).toBe(true)
    expect(isRasterImageMime('image/jpeg')).toBe(true)
    expect(isRasterImageMime('image/svg+xml')).toBe(false)
    expect(isRasterImageMime('application/pdf')).toBe(false)
  })

  it('detects pdf mime', () => {
    expect(isPdfMime('application/pdf')).toBe(true)
    expect(isPdfMime('image/png')).toBe(false)
  })
})
