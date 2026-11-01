import { describe, expect, it } from 'vitest'
import { productionMediaRoot, releasePaths, releaseStamp } from './release-layout'

describe('release layout', () => {
  it('formats a UTC stamp as YYYYMMDDHHMMSS', () => {
    expect(releaseStamp(new Date(Date.UTC(2026, 10, 1, 16, 51, 33)))).toBe('20261101165133')
    expect(releaseStamp(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe('20260102030405')
  })

  it('keeps releases, shared files, and the current link beside each other', () => {
    expect(releasePaths('/opt/datavalley/', '20261101165133')).toEqual({
      root: '/opt/datavalley',
      release: '/opt/datavalley/releases/20261101165133',
      shared: '/opt/datavalley/shared',
      envFile: '/opt/datavalley/shared/.env',
      media: '/opt/datavalley/shared/data/media',
      current: '/opt/datavalley/current',
    })
  })

  it('puts relative media under shared and leaves an absolute path unchanged', () => {
    expect(productionMediaRoot('/opt/datavalley', './data/media')).toBe(
      '/opt/datavalley/shared/data/media',
    )
    expect(productionMediaRoot('/opt/datavalley', '/var/lib/datavalley/media')).toBe(
      '/var/lib/datavalley/media',
    )
  })
})
