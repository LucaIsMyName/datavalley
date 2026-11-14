import { describe, expect, it } from 'vitest'
import { createHarness } from '../test/harness.js'
import { createJob } from './process.js'
import { dispatchBackgroundJob } from './process.js'

describe('dispatchBackgroundJob', () => {
  it('returns unknown payloads unchanged', async () => {
    const harness = await createHarness()
    const job = await createJob(harness.db, 'noop', { ping: true })
    const result = await dispatchBackgroundJob(harness.db, harness.env, job.id)
    expect(result).toMatchObject({ status: 'completed', result: { ping: true } })
    await harness.close()
  })
})