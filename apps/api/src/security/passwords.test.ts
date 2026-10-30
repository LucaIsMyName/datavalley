import { describe, expect, it } from 'vitest'
import { testEnv } from '../config/env.js'
import { assertPassword, hashPassword, verifyPassword } from './passwords.js'

describe('passwords', () => {
  it('requires 12 characters and hashes with Argon2id', async () => {
    expect(() => assertPassword('short')).toThrow(/12/)
    const hash = await hashPassword('correct horse battery', testEnv())
    expect(hash.startsWith('$argon2id$')).toBe(true)
    expect(await verifyPassword(hash, 'correct horse battery')).toBe(true)
    expect(await verifyPassword(hash, 'wrong horse battery')).toBe(false)
  })
})
