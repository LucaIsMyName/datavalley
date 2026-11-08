import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { invalidateFooter, invalidateOtherRowQueries, invalidateRowTitles, replaceCachedRows } from './cache.js'

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

  it('replaces only the rows a bulk save returned', () => {
    const client = new QueryClient()
    const kept = { id: 'row-2', version: 1, cells: { name: 'kept' } }
    client.setQueryData(['rows', 'table-1', '', null, ''], {
      pages: [{ rows: [{ id: 'row-1', version: 1, cells: { name: 'old' } }, kept], nextCursor: null }],
      pageParams: [null],
    })
    replaceCachedRows(client, 'table-1', [{ id: 'row-1', version: 2, cells: { name: 'new' } } as never])
    const data = client.getQueryData<{ pages: { rows: { id: string; cells: { name: string } }[] }[] }>([
      'rows',
      'table-1',
      '',
      null,
      '',
    ])
    expect(data?.pages[0]?.rows[0]?.cells.name).toBe('new')
    expect(data?.pages[0]?.rows[1]).toBe(kept)
  })

  it('invalidates row caches for every other table', async () => {
    const client = new QueryClient()
    client.setQueryData(['rows', 'table-1', '', null, ''], { pages: [], pageParams: [] })
    client.setQueryData(['rows', 'table-1', 'link'], { rows: [] })
    client.setQueryData(['rows', 'table-2', '', null, ''], { pages: [], pageParams: [] })
    client.setQueryData(['rows', 'table-2', 'link'], { rows: [] })
    client.setQueryData(['footer', 'table-2'], { footer: { sum: 1 } })

    await invalidateOtherRowQueries(client, 'table-1')

    expect(client.getQueryState(['rows', 'table-1', '', null, ''])?.isInvalidated).toBe(false)
    expect(client.getQueryState(['rows', 'table-1', 'link'])?.isInvalidated).toBe(false)
    expect(client.getQueryState(['rows', 'table-2', '', null, ''])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['rows', 'table-2', 'link'])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['footer', 'table-2'])?.isInvalidated).toBe(false)
  })

  it('refreshes this table and other tables when the main column changes', async () => {
    const client = new QueryClient()
    client.setQueryData(['rows', 'table-1', '', null, ''], { pages: [], pageParams: [] })
    client.setQueryData(['rows', 'table-2', '', null, ''], { pages: [], pageParams: [] })
    client.setQueryData(['footer', 'table-2'], { footer: { sum: 1 } })

    await invalidateRowTitles(client, 'table-1')

    expect(client.getQueryState(['rows', 'table-1', '', null, ''])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['rows', 'table-2', '', null, ''])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['footer', 'table-2'])?.isInvalidated).toBe(false)
  })
})
