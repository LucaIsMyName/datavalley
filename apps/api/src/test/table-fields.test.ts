import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { tableTags } from '../database/schema.js'
import { ApiSession, createHarness, createUser, login, userByName, type Harness } from './harness.js'

const password = 'correct horse battery'

describe('table fields', () => {
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
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'outsider',
      email: 'outsider@example.com',
      password,
      role: 'user',
    })
    session = await new ApiSession(harness.app).prepare()
    const signedIn = await login(session, 'ada', password)
    expect(signedIn.statusCode).toBe(200)
  })

  afterAll(async () => {
    await harness?.close()
  })

  it('saves a project description, including an empty one', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Described' } })
    const projectId = project.json().project.id as string
    const saved = await session.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${projectId}`,
      payload: { description: 'A short note' },
    })
    expect(saved.statusCode).toBe(200)
    expect(saved.json().project.description).toBe('A short note')
    const cleared = await session.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${projectId}`,
      payload: { description: '' },
    })
    expect(cleared.json().project.description).toBe('')
  })

  it('stores row notes and includes them in the CSV', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Notes' } })
    const projectId = project.json().project.id as string
    const table = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Notes' } })
    const tableId = table.json().table.id as string
    const column = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Name', type: 'text' } })
    const columnId = column.json().column.id as string
    const created = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [columnId]: 'Ada' } } })
    const row = created.json().row as { id: string; version: number }
    const noted = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${row.id}`,
      payload: { version: row.version, cells: {}, notes: '**Hello**' },
    })
    expect(noted.statusCode).toBe(200)
    expect(noted.json().row.notes).toBe('**Hello**')
    const listed = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    expect(listed.json().rows[0].notes).toBe('**Hello**')
    const exported = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/export`, payload: {} })
    expect(exported.json().csv).toContain('Notes')
    expect(exported.json().csv).toContain('**Hello**')
  })

  it('reuses a tag name and rejects a second row with that name', async () => {
    const { tableId } = await blankTable('Tags')
    const first = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/tags`, payload: { name: 'Lead' } })
    const second = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/tags`, payload: { name: 'lead' } })
    expect(first.statusCode).toBe(200)
    expect(second.json().tag.id).toBe(first.json().tag.id)
    await expect(harness.db.insert(tableTags).values({ tableId, name: 'Lead', color: 'red' })).rejects.toThrow()
  })

  it('returns a formula source and renames a tag without taking another tag name', async () => {
    const { tableId } = await blankTable('Formula tags')
    const amount = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Amount', type: 'number' } })
    const total = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Total', type: 'formula' } })
    const amountId = amount.json().column.id as string
    const totalId = total.json().column.id as string
    const saved = await session.inject({
      method: 'POST',
      url: `/api/v1/columns/${totalId}/formula`,
      payload: { expression: `{${amountId}}` },
    })
    expect(saved.statusCode).toBe(200)
    const detail = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}` })
    const formulaColumn = (detail.json().table.columns as { id: string; formula: string | null }[]).find((column) => column.id === totalId)
    expect(formulaColumn?.formula).toBe(`{${amountId}}`)
    const first = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/tags`, payload: { name: 'Lead' } })
    await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/tags`, payload: { name: 'Customer' } })
    const tagId = first.json().tag.id as string
    const renamed = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${tableId}/tags/${tagId}`,
      payload: { name: 'Prospect' },
    })
    expect(renamed.statusCode).toBe(200)
    expect(renamed.json().tag.name).toBe('Prospect')
    const duplicate = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${tableId}/tags/${tagId}`,
      payload: { name: 'customer' },
    })
    expect(duplicate.statusCode).toBe(400)
    const empty = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${tableId}/tags/${tagId}`,
      payload: { name: '   ' },
    })
    expect(empty.statusCode).toBe(400)
    const color = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${tableId}/tags/${tagId}`,
      payload: { color: 'blue' },
    })
    expect(color.statusCode).toBe(200)
    expect(color.json().tag).toMatchObject({ name: 'Prospect', color: 'blue' })
    const flag = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Paid', type: 'checkbox' } })
    const flagId = flag.json().column.id as string
    const row = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [flagId]: true } } })
    expect(row.statusCode).toBe(200)
    const listed = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    expect(listed.json().rows[0].cells[flagId]).toBe(true)
    const footer = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/footer` })
    expect(footer.statusCode).toBe(200)
    expect(footer.json().footer[flagId].filled).toBe(1)
  })

  it('assigns a status and refuses a user who is not a project member', async () => {
    const { tableId, projectId } = await blankTable('People fields')
    const statusColumn = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Stage', type: 'status' } })
    const userColumn = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Owner', type: 'user' } })
    const statusId = statusColumn.json().column.id as string
    const userId = userColumn.json().column.id as string
    const status = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/statuses`, payload: { name: 'Open' } })
    const created = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: {} })
    const row = created.json().row as { id: string; version: number }
    const assigned = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${row.id}`,
      payload: { version: row.version, cells: { [statusId]: status.json().status.id } },
    })
    expect(assigned.statusCode).toBe(200)
    expect(assigned.json().row.cells[statusId]).toBe(status.json().status.id)
    const outsider = await userByName(harness.db, 'outsider')
    const rejected = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${row.id}`,
      payload: { version: assigned.json().row.version, cells: { [userId]: [outsider?.id] } },
    })
    expect(rejected.statusCode).toBe(400)
    const members = await session.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/members` })
    const memberId = members.json().members[0].userId as string
    const accepted = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${row.id}`,
      payload: { version: assigned.json().row.version, cells: { [userId]: [memberId] } },
    })
    expect(accepted.statusCode).toBe(200)
    expect(accepted.json().row.cells[userId]).toEqual([memberId])
  })

  it('keeps sequence numbers after a row is deleted and rejects a write to the id column', async () => {
    const { tableId } = await blankTable('Sequence')
    const column = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'ID', type: 'row_id' } })
    const columnId = column.json().column.id as string
    expect(column.json().column.config.style).toBe('sequence')
    const first = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: {} })
    const second = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: {} })
    await session.inject({ method: 'DELETE', url: `/api/v1/rows/${first.json().row.id}` })
    const third = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: {} })
    const listed = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const numbers = (listed.json().rows as { id: string; rowNumber: number; cells: Record<string, unknown> }[])
      .map((row) => [row.id, row.rowNumber, row.cells[columnId]])
    expect(numbers).toEqual([
      [second.json().row.id, 2, 2],
      [third.json().row.id, 3, 3],
    ])
    const blocked = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${third.json().row.id}`,
      payload: { version: third.json().row.version, cells: { [columnId]: '9' } },
    })
    expect(blocked.statusCode).toBe(400)
  })

  it('rejects a fractional integer and returns the median', async () => {
    const { tableId } = await blankTable('Numbers')
    const column = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Amount', type: 'number' } })
    const columnId = column.json().column.id as string
    const configured = await session.inject({
      method: 'PATCH',
      url: `/api/v1/columns/${columnId}`,
      payload: { config: { variant: 'integer', icon: 'Hash' } },
    })
    expect(configured.statusCode).toBe(200)
    const fraction = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [columnId]: 1.5 } } })
    expect(fraction.statusCode).toBe(400)
    for (const value of [1, 2, 10]) {
      const saved = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [columnId]: value } } })
      expect(saved.statusCode).toBe(200)
    }
    const footer = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/footer` })
    expect(footer.statusCode).toBe(200)
    expect(footer.json().footer[columnId].median).toBe(2)
  })

  async function blankTable(name: string) {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name } })
    const projectId = project.json().project.id as string
    const table = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name } })
    return { projectId, tableId: table.json().table.id as string }
  }
})
