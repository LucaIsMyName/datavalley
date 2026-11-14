import { describe, expect, it } from 'vitest'
import type { Env } from '../config/env.js'
import { sendMail } from './smtp.js'

const baseEnv = {
  NODE_ENV: 'test',
  SMTP_HOST: '',
} as Env

describe('sendMail', () => {
  it('no-ops in test environment without SMTP', async () => {
    await expect(
      sendMail(baseEnv, { to: 'user@example.com', subject: 'Hi', text: 'Body' }),
    ).resolves.toBeUndefined()
  })
})