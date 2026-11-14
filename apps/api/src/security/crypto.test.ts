import { describe, expect, it } from 'vitest'
import { decryptString, encryptString, randomToken, safeEqual, sha256 } from './crypto.js'

describe('crypto', () => {
  it('hashes deterministically', () => {
    expect(sha256('abc')).toBe(sha256('abc'))
    expect(sha256('abc')).not.toBe(sha256('abd'))
  })

  it('encrypts and decrypts with the same key material', () => {
    const key = randomToken(16)
    const plain = 'connector-secret-value'
    const cipher = encryptString(key, plain)
    expect(cipher).not.toBe(plain)
    expect(decryptString(key, cipher)).toBe(plain)
  })

  it('compares strings in constant time when lengths match', () => {
    expect(safeEqual('token-a', 'token-a')).toBe(true)
    expect(safeEqual('token-a', 'token-b')).toBe(false)
    expect(safeEqual('short', 'longer')).toBe(false)
  })
})