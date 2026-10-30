import { describe, expect, it } from 'vitest'
import { loadEnv } from './env.js'

describe('loadEnv', () => {
  it('rejects a missing database and a short session secret', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/)
    expect(() =>
      loadEnv({
        DATABASE_URL: 'postgres://localhost/datavalley',
        SESSION_SECRET: 'short',
        CSRF_SECRET: 'test-csrf-secret-must-be-32-characters-long',
        CREDENTIALS_KEY: 'test-credentials-key-must-be-32-characters',
      }),
    ).toThrow(/SESSION_SECRET/)
  })

  it('applies local defaults', () => {
    const env = loadEnv({
      DATABASE_URL: 'postgres://localhost/datavalley',
      SESSION_SECRET: 'test-session-secret-must-be-32-characters',
      CSRF_SECRET: 'test-csrf-secret-must-be-32-characters-long',
      CREDENTIALS_KEY: 'test-credentials-key-must-be-32-characters',
    })
    expect(env.API_PORT).toBe(3000)
    expect(env.STATEMENT_TIMEOUT_MS).toBe(5000)
    expect(env.WEB_ORIGIN).toBe('http://localhost:5173')
  })
})
