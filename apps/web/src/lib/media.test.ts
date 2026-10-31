import { describe, expect, it } from 'vitest'
import { isRasterImageMime, mediaDownloadUrl } from './media'

describe('media helpers', () => {
  it('builds same-origin download URLs', () => {
    expect(mediaDownloadUrl('abc')).toBe('/api/v1/media/abc')
  })

  it('treats raster images separately from SVG', () => {
    expect(isRasterImageMime('image/png')).toBe(true)
    expect(isRasterImageMime('image/jpeg')).toBe(true)
    expect(isRasterImageMime('image/svg+xml')).toBe(false)
    expect(isRasterImageMime('application/pdf')).toBe(false)
  })
})
