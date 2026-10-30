import { afterAll, describe, expect, it } from 'vitest'
import { createHarness } from './harness.js'

describe('health', () => {
  let close: () => Promise<void>

  afterAll(async () => {
    await close?.()
  })

  it('reports a live database', async () => {
    const harness = await createHarness()
    close = harness.close
    const response = await harness.app.inject({ method: 'GET', url: '/api/v1/health' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ ok: true, database: 'up' })
  })
})
