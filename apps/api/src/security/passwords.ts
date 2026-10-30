import argon2 from 'argon2'
import type { Env } from '../config/env.js'
import { badRequest } from '../errors.js'

export function assertPassword(password: string, username?: string) {
  if (password.length < 12) {
    throw badRequest('Password must be at least 12 characters')
  }
  if (username && password.toLowerCase() === username.toLowerCase()) {
    throw badRequest('Password must be different from the username')
  }
}

export function hashPassword(password: string, env: Pick<Env, 'NODE_ENV'>) {
  const test = env.NODE_ENV === 'test'
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: test ? 4096 : 19456,
    timeCost: test ? 2 : 3,
    parallelism: 1,
  })
}

export function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password)
}
