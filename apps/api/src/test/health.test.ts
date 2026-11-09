import { afterAll, describe, expect, it, vi } from 'vitest'
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

    vi.spyOn(harness.db, 'execute').mockRejectedValueOnce(new Error('connection refused'))
    const down = await harness.app.inject({ method: 'GET', url: '/api/v1/health' })
    expect(down.statusCode).toBe(503)
    expect(down.json()).toEqual({ ok: false, database: 'down' })
  })
})
