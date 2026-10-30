import { describe, expect, it } from 'vitest'
import { passwordResetTokens } from '../database/schema.js'
import { ApiSession, createHarness, createUser } from './harness.js'

describe('password reset', () => {
  it('emails a one-time link and rejects an expired or reused token', async () => {
    const harness = await createHarness()
    const password = 'original-password-ok'
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
    })
    const session = await new ApiSession(harness.app).prepare()
    const missing = await session.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'nobody@example.com' },
    })
    expect(missing.statusCode).toBe(200)
    expect(missing.json().resetUrl).toBeUndefined()

    const sent = await session.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'ada@example.com' },
    })
    expect(sent.statusCode).toBe(200)
    const resetUrl = new URL(sent.json().resetUrl as string)
    const token = resetUrl.searchParams.get('token') ?? ''
    expect(token.length).toBeGreaterThan(10)

    await harness.db.update(passwordResetTokens).set({ expiresAt: new Date(Date.now() - 1000) })
    const expired = await session.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token, newPassword: 'replacement-password' },
    })
    expect(expired.statusCode).toBe(400)

    const again = await session.inject({
      method: 'POST',
      url: '/api/v1/auth/forgot-password',
      payload: { email: 'ada@example.com' },
    })
    const nextToken = new URL(again.json().resetUrl as string).searchParams.get('token') ?? ''
    const reset = await session.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: nextToken, newPassword: 'replacement-password' },
    })
    expect(reset.statusCode).toBe(200)
    const reused = await session.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: nextToken, newPassword: 'another-password-ok' },
    })
    expect(reused.statusCode).toBe(400)

    const login = await session.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { login: 'ada', password: 'replacement-password' },
    })
    expect(login.statusCode).toBe(200)
    await harness.close()
  })
})
