import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login, type Harness } from './harness.js'

const password = 'correct horse battery'

describe('table interactions', () => {
  let harness: Harness
  let session: ApiSession

  beforeAll(async () => {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    session = await new ApiSession(harness.app).prepare()
    const signedIn = await login(session, 'ada', password)
    expect(signedIn.statusCode).toBe(200)
  })

  afterAll(async () => {
    await harness?.close()
  })

  it('seeds every project with a People table and a sample row', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Starter', template: 'customers' } })
    expect(project.statusCode).toBe(200)
    const projectId = project.json().project.id as string
    const listed = await session.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    const names = (listed.json().tables as { name: string }[]).map((table) => table.name).sort()
    expect(names).toEqual(['Customers', 'People'])
    const people = (listed.json().tables as { id: string; name: string }[]).find((table) => table.name === 'People')
    const detail = await session.inject({ method: 'GET', url: `/api/v1/tables/${people?.id}` })
    const columns = detail.json().table.columns as { id: string; name: string; type: string }[]
    expect(columns.map((column) => [column.name, column.type])).toEqual([
      ['Name', 'text'],
      ['Mail', 'mail'],
    ])
    const rows = await session.inject({ method: 'GET', url: `/api/v1/tables/${people?.id}/rows` })
    const cells = rows.json().rows[0].cells as Record<string, unknown>
    expect(cells[columns[0].id]).toBe('John Doe')
    expect(cells[columns[1].id]).toBe('john@doe.com')
  })

  it('names an untitled table, inserts between neighbors, moves a row, and copies a column', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Layout' } })
    const projectId = project.json().project.id as string
    const first = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: {} })
    const second = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: {} })
    expect(first.json().table.name).toBe('Untitled')
    expect(second.json().table.name).toBe('Untitled 2')
    const tableId = first.json().table.id as string
    const name = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Name', type: 'text' },
    })
    const nameId = name.json().column.id as string
    const note = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Note', type: 'text' },
    })
    const noteId = note.json().column.id as string
    const inserted = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Mail', type: 'mail', beforeId: noteId },
    })
    expect(inserted.statusCode).toBe(200)
    const detail = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}` })
    expect((detail.json().table.columns as { name: string }[]).map((column) => column.name)).toEqual(['Name', 'Mail', 'Note'])
    const mailId = (detail.json().table.columns as { id: string; name: string }[]).find((column) => column.name === 'Mail')!.id
    const alpha = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { cells: { [nameId]: 'Ada', [mailId]: 'ada@example.com' } },
    })
    const beta = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { cells: { [nameId]: 'Bea', [mailId]: 'not-an-email' } },
    })
    expect(beta.statusCode).toBe(400)
    const between = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { beforeId: alpha.json().row.id, cells: { [nameId]: 'Ann', [mailId]: 'ann@example.com' } },
    })
    expect(between.statusCode).toBe(200)
    const moved = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows/move`,
      payload: { rowId: alpha.json().row.id, beforeId: between.json().row.id },
    })
    expect(moved.statusCode).toBe(200)
    const listed = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const order = (listed.json().rows as { cells: Record<string, unknown> }[]).map((row) => row.cells[nameId])
    expect(order).toEqual(['Ada', 'Ann'])
    const copied = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns/duplicate`,
      payload: { columnIds: [nameId] },
    })
    expect(copied.statusCode).toBe(200)
    const copyId = copied.json().columns[0].id as string
    const afterCopy = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    expect(afterCopy.json().rows[0].cells[copyId]).toBe('Ada')
  })

  it('previews a type change and clears only cells that do not match', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Convert' } })
    const projectId = project.json().project.id as string
    const table = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Amounts' } })
    const tableId = table.json().table.id as string
    const column = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Amount', type: 'text' },
    })
    const columnId = column.json().column.id as string
    await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [columnId]: '12' } } })
    await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [columnId]: 'nope' } } })
    const preview = await session.inject({
      method: 'POST',
      url: `/api/v1/columns/${columnId}/convert`,
      payload: { type: 'number', dryRun: true },
    })
    expect(preview.json()).toMatchObject({ cleared: 1, kept: 1 })
    const before = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    expect((before.json().rows as { cells: Record<string, unknown> }[]).map((row) => row.cells[columnId]).sort()).toEqual(['12', 'nope'])
    const converted = await session.inject({
      method: 'POST',
      url: `/api/v1/columns/${columnId}/convert`,
      payload: { type: 'number' },
    })
    expect(converted.json().cleared).toBe(1)
    const after = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const values = (after.json().rows as { cells: Record<string, unknown> }[]).map((row) => row.cells[columnId])
    expect(values.filter((value) => value != null)).toEqual([12])
  })

  it('saves a row color, a cell color, and conditional rules', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Paint' } })
    const projectId = project.json().project.id as string
    const listed = await session.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    const people = (listed.json().tables as { id: string; name: string }[]).find((table) => table.name === 'People')
    const detail = await session.inject({ method: 'GET', url: `/api/v1/tables/${people?.id}` })
    const nameId = (detail.json().table.columns as { id: string; name: string }[]).find((column) => column.name === 'Name')!.id
    const rows = await session.inject({ method: 'GET', url: `/api/v1/tables/${people?.id}/rows` })
    const row = rows.json().rows[0] as { id: string; version: number }
    const painted = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${row.id}`,
      payload: { version: row.version, cells: {}, color: '#fde68a', backgrounds: { [nameId]: '#bbf7d0' } },
    })
    expect(painted.statusCode).toBe(200)
    expect(painted.json().row.color).toBe('#fde68a')
    expect(painted.json().row.backgrounds[nameId]).toBe('#bbf7d0')
    const rules = [{ id: 'name', scope: 'cell', columnId: nameId, operator: 'eq', value: 'John Doe', style: { background: '#fecaca' } }]
    const saved = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${people?.id}`,
      payload: { formatRules: rules },
    })
    expect(saved.json().table.formatRules).toEqual(rules)
  })

  it('remembers sort and filter for the signed-in user', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'State', template: 'customers' } })
    const projectId = project.json().project.id as string
    const listed = await session.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    const people = (listed.json().tables as { id: string; name: string }[]).find((table) => table.name === 'People')
    const detail = await session.inject({ method: 'GET', url: `/api/v1/tables/${people?.id}` })
    const nameId = (detail.json().table.columns as { id: string; name: string }[]).find((column) => column.name === 'Name')!.id
    const empty = await session.inject({ method: 'GET', url: `/api/v1/tables/${people?.id}/state` })
    expect(empty.statusCode).toBe(200)
    expect(empty.json()).toEqual({ sort: null, filter: null })
    const saved = await session.inject({
      method: 'PUT',
      url: `/api/v1/tables/${people?.id}/state`,
      payload: { sort: { columnId: nameId, direction: 'desc' }, filter: { op: 'contains', columnId: nameId, value: 'Ada' } },
    })
    expect(saved.statusCode).toBe(200)
    const again = await session.inject({ method: 'GET', url: `/api/v1/tables/${people?.id}/state` })
    expect(again.json()).toEqual({
      sort: { columnId: nameId, direction: 'desc' },
      filter: { op: 'contains', columnId: nameId, value: 'Ada' },
    })
  })
})
