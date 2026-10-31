import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { invalidateFooter } from './cache.js'

describe('footer cache', () => {
  it('invalidates every footer query for the table and leaves other tables alone', async () => {
    const client = new QueryClient()
    client.setQueryData(['footer', 'table-1', 'a'], { footer: { sum: 1 } })
    client.setQueryData(['footer', 'table-1', 'b'], { footer: { sum: 2 } })
    client.setQueryData(['footer', 'table-2', 'a'], { footer: { sum: 9 } })

    await invalidateFooter(client, 'table-1')

    expect(client.getQueryState(['footer', 'table-1', 'a'])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['footer', 'table-1', 'b'])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['footer', 'table-2', 'a'])?.isInvalidated).toBe(false)
  })
})
