import { describe, expect, it } from 'vitest'
import { assertPublicHost, isBlockedHostError, isPrivateIp, publicLookup } from './fetch.js'

function lookupAll(hostname: string) {
  return new Promise<{ error: NodeJS.ErrnoException | null; addresses: unknown }>((resolve) => {
    publicLookup(hostname, { all: true }, (error, addresses) => resolve({ error, addresses }))
  })
}

describe('connector host checks', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '[::ffff:10.0.0.1]',
    '64:ff9b::a00:1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'ff02::1',
  ])('treats %s as private', (address) => {
    expect(isPrivateIp(address)).toBe(true)
  })

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111'])('treats %s as public', (address) => {
    expect(isPrivateIp(address)).toBe(false)
  })

  it('rejects private literals and localhost names before any request', async () => {
    await expect(assertPublicHost('localhost')).rejects.toThrow('not allowed')
    await expect(assertPublicHost('[::ffff:127.0.0.1]')).rejects.toThrow('not allowed')
    await expect(assertPublicHost('169.254.169.254')).rejects.toThrow('not allowed')
  })

  it('refuses to connect when a name resolves to a private address at connect time', async () => {
    const { error } = await lookupAll('localhost')
    expect(error).not.toBeNull()
    expect(isBlockedHostError(error)).toBe(true)
    expect(isBlockedHostError(new TypeError('fetch failed', { cause: error }))).toBe(true)
  })
})
