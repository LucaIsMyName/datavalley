import { describe, expect, it } from 'vitest'
import { AppError } from '../errors.js'
import { requireAdmin, requireSubject, requireUserSubject } from './guards.js'

describe('requireSubject', () => {
  it('returns subject when present', () => {
    const subject = {
      kind: 'user' as const,
      id: 'u1',
      role: 'user' as const,
      source: 'web' as const,
      user: null,
    }
    expect(requireSubject({ subject } as never)).toBe(subject)
  })

  it('throws unauthorized when missing', () => {
    expect(() => requireSubject({ subject: null } as never)).toThrowError('Authentication required')
  })
})

describe('requireAdmin', () => {
  it('allows admin role', () => {
    const subject = {
      kind: 'user' as const,
      id: 'a1',
      role: 'admin' as const,
      source: 'web' as const,
      user: null,
    }
    expect(requireAdmin({ subject } as never)).toBe(subject)
  })

  it('rejects non-admin', () => {
    const subject = {
      kind: 'user' as const,
      id: 'u1',
      role: 'user' as const,
      source: 'web' as const,
      user: null,
    }
    expect(() => requireAdmin({ subject } as never)).toThrowError(AppError)
    try {
      requireAdmin({ subject } as never)
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('forbidden')
    }
  })
})

describe('requireUserSubject', () => {
  it('requires a user-backed session', () => {
    const subject = {
      kind: 'user' as const,
      id: 'u1',
      role: 'user' as const,
      source: 'web' as const,
      user: { id: 'u1', username: 'x', email: 'x@x.com', role: 'user' as const } as never,
    }
    expect(requireUserSubject({ subject } as never)).toBe(subject)
  })

  it('rejects api keys without user', () => {
    const subject = {
      kind: 'api_key' as const,
      id: 'k1',
      role: 'user' as const,
      source: 'api_key' as const,
      user: null,
    }
    expect(() => requireUserSubject({ subject } as never)).toThrowError('Authentication required')
  })
})