import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  dockerMediaRoot,
  isLoopbackUrl,
  postgresIdentity,
  productionMediaRoot,
  redisPassword,
  releasePaths,
  releaseStamp,
  remoteCopyToolsShell,
  rewriteLoopbackHost,
} from './release-layout'

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

  it('installs ssh, scp, and rsync on the server only when one is missing', () => {
    const command = remoteCopyToolsShell()
    expect(command).toContain('command -v ssh')
    expect(command).toContain('command -v scp')
    expect(command).toContain('command -v rsync')
    expect(command).toContain('apt-get install -y openssh-client rsync')
  })

  it('puts relative media under shared and leaves an absolute path unchanged', () => {
    expect(productionMediaRoot('/opt/datavalley', './data/media')).toBe(
      '/opt/datavalley/shared/data/media',
    )
    expect(productionMediaRoot('/opt/datavalley', '/var/lib/datavalley/media')).toBe(
      '/var/lib/datavalley/media',
    )
  })

  it('rewrites loopback database and redis hosts to compose service names', () => {
    expect(isLoopbackUrl('postgres://datavalley:secret@127.0.0.1:5432/datavalley')).toBe(true)
    expect(isLoopbackUrl('postgres://datavalley:secret@localhost:5432/datavalley')).toBe(true)
    expect(isLoopbackUrl('postgres://datavalley:secret@[::1]:5432/datavalley')).toBe(true)
    expect(isLoopbackUrl('postgresql://datavalley:secret@db.internal:5432/datavalley')).toBe(false)
    expect(
      rewriteLoopbackHost('postgres://datavalley:secret@127.0.0.1:5432/datavalley', 'postgres'),
    ).toBe('postgres://datavalley:secret@postgres:5432/datavalley')
    expect(
      rewriteLoopbackHost('postgres://datavalley:secret@localhost:5432/datavalley', 'postgres'),
    ).toBe('postgres://datavalley:secret@postgres:5432/datavalley')
    expect(
      rewriteLoopbackHost('postgresql://datavalley:p%40ss@127.0.0.1:5432/datavalley', 'postgres'),
    ).toBe('postgresql://datavalley:p%40ss@postgres:5432/datavalley')
    expect(
      rewriteLoopbackHost('postgresql://datavalley:secret@db.internal:5432/datavalley', 'postgres'),
    ).toBe('postgresql://datavalley:secret@db.internal:5432/datavalley')
    expect(rewriteLoopbackHost('redis://127.0.0.1:6379', 'redis')).toBe('redis://redis:6379')
    expect(rewriteLoopbackHost('redis://:secret@localhost:6379/0', 'redis')).toBe(
      'redis://:secret@redis:6379/0',
    )
    expect(rewriteLoopbackHost('redis://cache.internal:6379', 'redis')).toBe(
      'redis://cache.internal:6379',
    )
  })

  it('reads postgres and redis credentials from the service URL', () => {
    expect(postgresIdentity('postgres://datavalley:secret@127.0.0.1:5432/datavalley')).toEqual({
      user: 'datavalley',
      password: 'secret',
      database: 'datavalley',
    })
    expect(postgresIdentity('postgresql://datavalley:p%40ss@127.0.0.1:5432/datavalley')).toEqual({
      user: 'datavalley',
      password: 'p@ss',
      database: 'datavalley',
    })
    expect(redisPassword('redis://127.0.0.1:6379')).toBe('')
    expect(redisPassword('redis://:s%3Ecret@localhost:6379/0')).toBe('s>cret')
  })

  it('keeps the docker media path mounted by compose', () => {
    const compose = readFileSync(new URL('../deploy/compose.yml', import.meta.url), 'utf8')
    expect(compose).toContain(dockerMediaRoot)
    expect(dockerMediaRoot).toBe('/var/lib/datavalley/media')
  })
})
