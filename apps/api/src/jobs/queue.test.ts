import { describe, expect, it } from 'vitest'
import type { Env } from '../config/env.js'
import { enqueueBackgroundJob } from './queue.js'

describe('enqueueBackgroundJob', () => {
  it('returns false when Redis is not configured', async () => {
    const env = { REDIS_URL: '' } as Env
    await expect(enqueueBackgroundJob(env, 'job-123')).resolves.toBe(false)
  })
})