import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login, type Harness } from './harness.js'

const password = 'correct horse battery'
const boundary = 'datavalley-boundary'

function csvUpload(csv: string) {
  return `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="rows.csv"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n--${boundary}--\r\n`
}

describe('row batches', () => {
  let harness: Harness
  let session: ApiSession

  beforeAll(async () => {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, { username: 'ada', email: 'ada@example.com', password, role: 'admin' })
    session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'ada', password)).statusCode).toBe(200)
  })

  afterAll(async () => {
    await harness?.close()
  })

  async function table(name: string) {
    const projectId = (await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name } })).json().project.id as string
    return (await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name } })).json().table.id as string
  }

  it('imports select labels and checkbox words the way the column reads them', async () => {
    const tableId = await table('Import')
    const priorityId = (await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Priority', type: 'select' } })).json().column.id as string
    const optionId = (await session.inject({ method: 'POST', url: `/api/v1/columns/${priorityId}/options`, payload: { label: 'High' } })).json().option.id as string
    const paidId = (await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Paid', type: 'checkbox' } })).json().column.id as string

    const imported = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/import`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: csvUpload('Priority,Paid\r\n high ,YES\r\nHigh,no'),
    })
    expect(imported.statusCode).toBe(200)
    expect(imported.json()).toMatchObject({ created: 2, errors: [] })
    const rows = (await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })).json().rows as { cells: Record<string, unknown> }[]
    expect(rows.map((row) => row.cells[priorityId])).toEqual([optionId, optionId])
    expect(rows.map((row) => row.cells[paidId])).toEqual([true, false])
  })

  it('deletes nothing when one row of a bulk delete fails', async () => {
    const tableId = await table('Delete')
    const keep = (await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: {} } })).json().row.id as string
    const failed = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows/bulk-delete`, payload: { rowIds: [keep, randomUUID()] } })
    expect(failed.statusCode).toBe(404)
    const rows = (await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })).json().rows as { id: string }[]
    expect(rows.map((row) => row.id)).toEqual([keep])

    const deleted = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows/bulk-delete`, payload: { rowIds: [keep] } })
    expect(deleted.statusCode).toBe(200)
    expect((await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })).json().rows).toEqual([])
  })

  it('duplicates every chosen row or none of them', async () => {
    const tableId = await table('Duplicate')
    const nameId = (await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Name', type: 'text' } })).json().column.id as string
    const source = (await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [nameId]: 'Ada' } } })).json().row.id as string
    const failed = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows/duplicate`, payload: { rowIds: [source, randomUUID()] } })
    expect(failed.statusCode).toBe(404)
    expect((await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })).json().rows).toHaveLength(1)

    const copied = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows/duplicate`, payload: { rowIds: [source] } })
    expect(copied.statusCode).toBe(200)
    const rows = (await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })).json().rows as { cells: Record<string, unknown> }[]
    expect(rows.map((row) => row.cells[nameId])).toEqual(['Ada', 'Ada'])
  })

  it('keeps rows in placement order when inserting and moving next to neighbours', async () => {
    const tableId = await table('Order')
    const nameId = (await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Name', type: 'text' } })).json().column.id as string
    const create = async (name: string, placement: { beforeId?: string; afterId?: string } = {}) =>
      (await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [nameId]: name }, ...placement } })).json().row.id as string
    const names = async () =>
      ((await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })).json().rows as { cells: Record<string, unknown> }[]).map((row) => row.cells[nameId])

    const b = await create('b')
    const a = await create('a', { beforeId: b })
    const first = await create('first', { beforeId: a })
    const c = await create('c', { afterId: b })
    await create('ab', { afterId: a })
    expect(await names()).toEqual(['first', 'a', 'ab', 'b', 'c'])

    const move = (rowId: string, placement: { beforeId?: string; afterId?: string }) =>
      session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows/move`, payload: { rowId, ...placement } })
    expect((await move(first, { afterId: c })).statusCode).toBe(200)
    expect((await move(c, { beforeId: a })).statusCode).toBe(200)
    expect(await names()).toEqual(['c', 'a', 'ab', 'b', 'first'])
    expect((await move(c, { beforeId: c })).statusCode).toBe(400)
    expect((await move(c, { afterId: randomUUID() })).statusCode).toBe(400)
  })
})
