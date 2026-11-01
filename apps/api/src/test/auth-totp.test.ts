import * as OTPAuth from 'otpauth'
import { describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login } from './harness.js'

const password = 'correct horse battery'

function totpToken(secretBase32: string) {
  const secret = OTPAuth.Secret.fromBase32(secretBase32)
  return new OTPAuth.TOTP({ secret, digits: 6, period: 30, algorithm: 'SHA1' }).generate()
}

describe('totp login', () => {
  it('requires totp, accepts codes and recovery, and rate limits bad totp', async () => {
    const harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'mfa',
      email: 'mfa@example.com',
      password,
    })
    const session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'mfa', password)).statusCode).toBe(200)

    const enrolled = await session.inject({ method: 'POST', url: '/api/v1/totp/enroll' })
    expect(enrolled.statusCode).toBe(200)
    const secret = enrolled.json().secret as string
    const confirm = await session.inject({
      method: 'POST',
      url: '/api/v1/totp/confirm',
      payload: { code: totpToken(secret) },
    })
    expect(confirm.statusCode).toBe(200)
    const recoveryCodes = confirm.json().recoveryCodes as string[]
    expect(recoveryCodes.length).toBeGreaterThan(0)

    await session.inject({ method: 'POST', url: '/api/v1/auth/logout' })

    const needsTotp = await login(await new ApiSession(harness.app).prepare(), 'mfa', password)
    expect(needsTotp.statusCode).toBe(401)
    expect(needsTotp.json().error.code).toBe('totp_required')

    const fresh = await new ApiSession(harness.app).prepare()
    const withTotp = await fresh.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { login: 'mfa', password, totpCode: totpToken(secret) },
    })
    expect(withTotp.statusCode).toBe(200)

    const recoverySession = await new ApiSession(harness.app).prepare()
    const withRecovery = await recoverySession.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { login: 'mfa', password, recoveryCode: recoveryCodes[0] },
    })
    expect(withRecovery.statusCode).toBe(200)

    const reuseRecovery = await new ApiSession(harness.app).prepare()
    const spent = await reuseRecovery.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { login: 'mfa', password, recoveryCode: recoveryCodes[0] },
    })
    expect(spent.statusCode).toBe(401)

    const both = await new ApiSession(harness.app).prepare()
    const rejected = await both.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { login: 'mfa', password, totpCode: '123456', recoveryCode: recoveryCodes[1] },
    })
    expect(rejected.statusCode).toBe(400)

    const brute = await new ApiSession(harness.app).prepare()
    for (let attempt = 0; attempt < 9; attempt++) {
      const bad = await brute.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { login: 'mfa', password, totpCode: '000000' },
      })
      expect(bad.statusCode).toBe(401)
    }
    const rateLimited = await brute.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { login: 'mfa', password, totpCode: '000000' },
    })
    expect(rateLimited.statusCode).toBe(429)
    const locked = await brute.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { login: 'mfa', password, totpCode: totpToken(secret) },
    })
    expect(locked.statusCode).toBe(429)

    await harness.close()
  })
})
