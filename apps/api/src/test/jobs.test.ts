import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { backgroundJobs } from '../database/schema.js'
import { createJob, runJob } from '../jobs/process.js'
import { createHarness } from './harness.js'

describe('background jobs', () => {
  it('does not run a handler again after the job has completed or is already running', async () => {
    const harness = await createHarness()
    const job = await createJob(harness.db, 'once', { ok: true })
    let calls = 0
    const done = await runJob(harness.db, job.id, async () => {
      calls += 1
      return { ok: true }
    })
    expect(done.status).toBe('completed')
    const again = await runJob(harness.db, job.id, async () => {
      calls += 1
      return { again: true }
    })
    expect(again.status).toBe('completed')
    expect(calls).toBe(1)

    const running = await createJob(harness.db, 'busy', {})
    await harness.db
      .update(backgroundJobs)
      .set({ status: 'running', result: { kept: true } })
      .where(eq(backgroundJobs.id, running.id))
    let busyCalls = 0
    const skipped = await runJob(harness.db, running.id, async () => {
      busyCalls += 1
      return { no: true }
    })
    expect(skipped.status).toBe('completed')
    expect(busyCalls).toBe(0)
    await harness.close()
  })
})
