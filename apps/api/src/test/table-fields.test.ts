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
    expect(saved.json().id).toBeNull()
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

  it('keeps a different formula on each cell', async () => {
    const { tableId, projectId } = await blankTable('Cell formulas')
    const amount = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Amount', type: 'number' } })
    const total = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Total', type: 'formula' } })
    const stage = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Stage', type: 'status' } })
    const tags = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Tags', type: 'tags' } })
    const amountId = amount.json().column.id as string
    const totalId = total.json().column.id as string
    const stageId = stage.json().column.id as string
    const tagsId = tags.json().column.id as string
    const open = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/statuses`, payload: { name: 'Open' } })
    const lead = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/tags`, payload: { name: 'Lead' } })
    const first = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { cells: { [amountId]: 2, [stageId]: open.json().status.id, [tagsId]: [lead.json().tag.id] } },
    })
    const second = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [amountId]: 5, [stageId]: open.json().status.id } } })
    const firstId = first.json().row.id as string
    const secondId = second.json().row.id as string
    const copied = await session.inject({ method: 'POST', url: `/api/v1/columns/${totalId}/formula`, payload: { expression: 'Amount * 2' } })
    expect(copied.statusCode).toBe(200)
    const changed = await session.inject({
      method: 'POST',
      url: `/api/v1/rows/${secondId}/columns/${totalId}/formula`,
      payload: { expression: 'Amount + 1' },
    })
    expect(changed.statusCode).toBe(200)
    const listed = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const rows = listed.json().rows as { id: string; cells: Record<string, unknown> }[]
    expect(rows.find((row) => row.id === firstId)?.cells[totalId]).toBe(4)
    expect(rows.find((row) => row.id === secondId)?.cells[totalId]).toBe(6)
    const source = await session.inject({ method: 'GET', url: `/api/v1/rows/${firstId}/columns/${totalId}/formula` })
    expect(source.json().source).toBe('[Amount] * 2')
    const cleared = await session.inject({ method: 'POST', url: `/api/v1/rows/${firstId}/columns/${totalId}/formula`, payload: { expression: '' } })
    expect(cleared.statusCode).toBe(200)
    const after = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const afterRows = after.json().rows as { id: string; cells: Record<string, unknown> }[]
    expect(afterRows.find((row) => row.id === firstId)?.cells[totalId] ?? null).toBeNull()
    expect(afterRows.find((row) => row.id === secondId)?.cells[totalId]).toBe(6)

    const label = await session.inject({
      method: 'POST',
      url: `/api/v1/rows/${firstId}/columns/${totalId}/formula`,
      payload: { expression: 'IF(Stage = "Open", "Yes", "No")' },
    })
    expect(label.statusCode).toBe(200)
    const counted = await session.inject({
      method: 'POST',
      url: `/api/v1/rows/${secondId}/columns/${totalId}/formula`,
      payload: { expression: 'COUNTIF(Stage, "Open")' },
    })
    expect(counted.statusCode).toBe(200)
    const tagged = await session.inject({ method: 'POST', url: '/api/v1/formulas/validate', payload: { tableId, expression: 'CONTAINS(Tags, "Lead")', rowId: firstId } })
    expect(tagged.json().value).toBe(true)
    const again = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const values = again.json().rows as { id: string; cells: Record<string, unknown> }[]
    expect(values.find((row) => row.id === firstId)?.cells[totalId]).toBe('Yes')
    expect(values.find((row) => row.id === secondId)?.cells[totalId]).toBe(2)

    const listedTables = await session.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    const peopleId = (listedTables.json().tables as { id: string; name: string }[]).find((table) => table.name === 'People')?.id
    expect(peopleId).toBeTruthy()
    const mail = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Email', type: 'mail' } })
    const mailId = mail.json().column.id as string
    const versionBefore = (await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })).json().rows as { id: string; version: number }[]
    await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${firstId}`,
      payload: { version: versionBefore.find((row) => row.id === firstId)?.version, cells: { [mailId]: 'john@doe.com' } },
    })
    const looked = await session.inject({
      method: 'POST',
      url: '/api/v1/formulas/validate',
      payload: { tableId, rowId: firstId, expression: 'LOOKUP(People.Mail, Email, People.Name)' },
    })
    expect(looked.json().value).toBe('John Doe')
    const peopleRows = await session.inject({ method: 'GET', url: `/api/v1/tables/${peopleId}/rows` })
    const targetId = peopleRows.json().rows[0].id as string
    const pointed = await session.inject({
      method: 'POST',
      url: '/api/v1/formulas/validate',
      payload: { tableId, rowId: firstId, expression: `People.Name@${targetId}` },
    })
    expect(pointed.json().value).toBe('John Doe')

    const link = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/relations`,
      payload: { toTableId: peopleId, cardinality: 'many_to_one', name: 'Customer' },
    })
    const linkId = link.json().relation.column.id as string
    const linkedRow = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const version = (linkedRow.json().rows as { id: string; version: number }[]).find((row) => row.id === firstId)?.version
    await session.inject({ method: 'PATCH', url: `/api/v1/rows/${firstId}`, payload: { version, cells: { [linkId]: targetId } } })
    const related = await session.inject({
      method: 'POST',
      url: '/api/v1/formulas/validate',
      payload: { tableId, rowId: firstId, expression: 'RELATION(Customer, Name)' },
    })
    expect(related.json().value).toBe('John Doe')

    const outsider = await new ApiSession(harness.app).prepare()
    expect((await login(outsider, 'outsider', password)).statusCode).toBe(200)
    const foreign = await outsider.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Vault project' } })
    const foreignTable = await outsider.inject({
      method: 'POST',
      url: `/api/v1/projects/${foreign.json().project.id}/tables`,
      payload: { name: 'Vault' },
    })
    const secret = await outsider.inject({
      method: 'POST',
      url: `/api/v1/tables/${foreignTable.json().table.id}/columns`,
      payload: { name: 'Secret', type: 'text' },
    })
    const secretId = secret.json().column.id as string
    await outsider.inject({
      method: 'POST',
      url: `/api/v1/tables/${foreignTable.json().table.id}/rows`,
      payload: { cells: { [secretId]: 'SENTINEL-SECRET' } },
    })
    const blocked = await session.inject({
      method: 'POST',
      url: '/api/v1/formulas/validate',
      payload: {
        tableId,
        rowId: firstId,
        expression: `LOOKUP({${foreignTable.json().table.id}}.{${secretId}}, Email, {${foreignTable.json().table.id}}.{${secretId}})`,
      },
    })
    expect(blocked.json().value).toEqual({ error: '#REF' })
    expect(JSON.stringify(blocked.json())).not.toContain('SENTINEL-SECRET')
    const hidden = await outsider.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/formula-catalog` })
    expect(hidden.statusCode).toBe(404)
    const own = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/formula-catalog` })
    expect(own.statusCode).toBe(200)
    expect(JSON.stringify(own.json())).toContain('People')
    expect(JSON.stringify(own.json())).not.toContain('outsider')
  })

  it('copies a formula expression onto the dragged rows and can clear them', async () => {
    const { tableId } = await blankTable('Formula fill')
    const amount = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Amount', type: 'number' } })
    const total = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Total', type: 'formula' } })
    const amountId = amount.json().column.id as string
    const totalId = total.json().column.id as string
    const first = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [amountId]: 2 } } })
    const second = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [amountId]: 5 } } })
    const third = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [amountId]: 9 } } })
    const firstId = first.json().row.id as string
    const secondId = second.json().row.id as string
    const thirdId = third.json().row.id as string
    await session.inject({ method: 'POST', url: `/api/v1/rows/${firstId}/columns/${totalId}/formula`, payload: { expression: '[Amount] * 2' } })
    await session.inject({ method: 'POST', url: `/api/v1/rows/${secondId}/columns/${totalId}/formula`, payload: { expression: '[Amount] + 1' } })
    const filled = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/formulas/fill`,
      payload: { columnId: totalId, sourceRowId: firstId, rowIds: [secondId, firstId] },
    })
    expect(filled.statusCode).toBe(200)
    expect(filled.json()).toEqual({ expression: '[Amount] * 2', previous: [{ rowId: secondId, source: '[Amount] + 1' }] })
    const listed = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const rows = listed.json().rows as { id: string; cells: Record<string, unknown> }[]
    expect(rows.find((row) => row.id === firstId)?.cells[totalId]).toBe(4)
    expect(rows.find((row) => row.id === secondId)?.cells[totalId]).toBe(10)
    expect(rows.find((row) => row.id === thirdId)?.cells[totalId] ?? null).toBeNull()
    const cleared = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/formulas/fill`,
      payload: { columnId: totalId, sourceRowId: thirdId, rowIds: [secondId] },
    })
    expect(cleared.statusCode).toBe(200)
    expect(cleared.json().previous).toEqual([{ rowId: secondId, source: '[Amount] * 2' }])
    const after = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const afterRows = after.json().rows as { id: string; cells: Record<string, unknown> }[]
    expect(afterRows.find((row) => row.id === secondId)?.cells[totalId] ?? null).toBeNull()
    expect(afterRows.find((row) => row.id === firstId)?.cells[totalId]).toBe(4)
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

  it('adds a number from another cell and keeps a linked field on that table', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Bracket math' } })
    const projectId = project.json().project.id as string
    const listed = await session.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    const peopleId = (listed.json().tables as { id: string; name: string }[]).find((table) => table.name === 'People')?.id
    expect(peopleId).toBeTruthy()
    const copy = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${peopleId}/columns`,
      payload: { name: 'Column copy', type: 'number' },
    })
    const copyId = copy.json().column.id as string
    const peopleRows = await session.inject({ method: 'GET', url: `/api/v1/tables/${peopleId}/rows` })
    const sample = peopleRows.json().rows[0] as { id: string; version: number; rowNumber: number }
    const patched = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${sample.id}`,
      payload: { version: sample.version, cells: { [copyId]: 10 } },
    })
    expect(patched.statusCode).toBe(200)
    const orders = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Orders' },
    })
    const ordersId = orders.json().table.id as string
    const localName = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${ordersId}/columns`,
      payload: { name: 'Name', type: 'text' },
    })
    const total = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${ordersId}/columns`,
      payload: { name: 'Total', type: 'formula' },
    })
    const totalId = total.json().column.id as string
    const order = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${ordersId}/rows`,
      payload: { cells: { [localName.json().column.id as string]: 'Local' } },
    })
    const orderRow = order.json().row as { id: string; version: number }
    const link = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${ordersId}/relations`,
      payload: { toTableId: peopleId, cardinality: 'many_to_one', name: 'Customer' },
    })
    const linkId = link.json().relation.column.id as string
    const linked = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${orderRow.id}`,
      payload: { version: orderRow.version, cells: { [linkId]: sample.id } },
    })
    expect(linked.statusCode).toBe(200)
    const expression = `1 + 2 + 7 / 4 / 3.75646 + [People -> Column copy -> #${sample.rowNumber}]`
    const math = await session.inject({
      method: 'POST',
      url: '/api/v1/formulas/validate',
      payload: { tableId: peopleId, rowId: sample.id, expression },
    })
    expect(math.statusCode).toBe(200)
    expect(math.json().value).toBeCloseTo(1 + 2 + 7 / 4 / 3.75646 + 10)
    const empty = await session.inject({ method: 'POST', url: `/api/v1/tables/${peopleId}/rows`, payload: { cells: {} } })
    expect(empty.statusCode).toBe(200)
    const emptyId = empty.json().row.id as string
    const listedPeople = await session.inject({ method: 'GET', url: `/api/v1/tables/${peopleId}/rows` })
    const emptyRow = (listedPeople.json().rows as { id: string; rowNumber: number }[]).find((row) => row.id === emptyId)
    expect(emptyRow?.rowNumber).toBeGreaterThan(0)
    const blank = await session.inject({
      method: 'POST',
      url: '/api/v1/formulas/validate',
      payload: {
        tableId: peopleId,
        rowId: sample.id,
        expression: `1 + 2 + 7 / 4 / 3.75646 + [People -> Column copy -> #${emptyRow!.rowNumber}]`,
      },
    })
    expect(blank.statusCode).toBe(200)
    expect(blank.json().value).toBeCloseTo(1 + 2 + 7 / 4 / 3.75646)
    const formula = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${peopleId}/columns`,
      payload: { name: 'Total', type: 'formula' },
    })
    const formulaId = formula.json().column.id as string
    const stored = await session.inject({
      method: 'POST',
      url: `/api/v1/rows/${sample.id}/columns/${formulaId}/formula`,
      payload: { expression },
    })
    expect(stored.statusCode).toBe(200)
    const source = await session.inject({ method: 'GET', url: `/api/v1/rows/${sample.id}/columns/${formulaId}/formula` })
    expect(source.json().source).toBe(expression)
    const related = await session.inject({
      method: 'POST',
      url: '/api/v1/formulas/validate',
      payload: { tableId: ordersId, rowId: orderRow.id, expression: '[Customer -> Name]' },
    })
    expect(related.statusCode).toBe(200)
    expect(related.json().value).toBe('John Doe')
    const listedColumn = await session.inject({
      method: 'POST',
      url: '/api/v1/formulas/validate',
      payload: { tableId: ordersId, rowId: orderRow.id, expression: '1 + [People -> Column copy]' },
    })
    expect(listedColumn.statusCode).toBe(400)
    expect(listedColumn.json().error.message).toBe('People -> Column copy is every row. Choose one row, or wrap it in SUM.')
    const orderSource = await session.inject({
      method: 'POST',
      url: `/api/v1/rows/${orderRow.id}/columns/${totalId}/formula`,
      payload: { expression: '[Customer -> Name]' },
    })
    expect(orderSource.statusCode).toBe(200)
    const opened = await session.inject({ method: 'GET', url: `/api/v1/rows/${orderRow.id}/columns/${totalId}/formula` })
    expect(opened.json().source).toBe('[Customer -> Name]')
  })

  it('recomputes a formula after the referenced cell changes', async () => {
    const { tableId } = await blankTable('Refresh')
    const amount = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Amount', type: 'number' } })
    const total = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Total', type: 'formula' } })
    const amountId = amount.json().column.id as string
    const totalId = total.json().column.id as string
    const created = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [amountId]: 2 } } })
    const rowId = created.json().row.id as string
    const saved = await session.inject({
      method: 'POST',
      url: `/api/v1/rows/${rowId}/columns/${totalId}/formula`,
      payload: { expression: '[Amount] * 2' },
    })
    expect(saved.statusCode).toBe(200)
    const before = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const current = (before.json().rows as { id: string; version: number; cells: Record<string, unknown> }[]).find((row) => row.id === rowId)
    expect(current?.cells[totalId]).toBe(4)
    const patched = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${rowId}`,
      payload: { version: current?.version, cells: { [amountId]: 7 } },
    })
    expect(patched.statusCode).toBe(200)
    const after = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    expect((after.json().rows as { id: string; cells: Record<string, unknown> }[]).find((row) => row.id === rowId)?.cells[totalId]).toBe(14)
  })

  it('recomputes a whole-column formula when an older row changes', async () => {
    const { tableId } = await blankTable('Rollup')
    const amount = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Amount', type: 'number' } })
    const total = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Total', type: 'formula' } })
    const amountId = amount.json().column.id as string
    const totalId = total.json().column.id as string
    const early = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [amountId]: 1 } } })
    await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [amountId]: 10 } } })
    const latest = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [amountId]: 100 } } })
    const earlyId = early.json().row.id as string
    const latestId = latest.json().row.id as string
    const saved = await session.inject({
      method: 'POST',
      url: `/api/v1/columns/${totalId}/formula`,
      payload: { expression: 'SUM([Rollup -> Amount])' },
    })
    expect(saved.statusCode).toBe(200)
    let version = latest.json().row.version as number
    for (let step = 0; step < 3; step += 1) {
      const bumped = await session.inject({
        method: 'PATCH',
        url: `/api/v1/rows/${latestId}`,
        payload: { version, cells: { [amountId]: 100 } },
      })
      expect(bumped.statusCode).toBe(200)
      version = bumped.json().row.version as number
    }
    const before = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const rows = before.json().rows as { id: string; version: number; cells: Record<string, unknown> }[]
    expect(rows.find((row) => row.id === latestId)?.cells[totalId]).toBe(111)
    const older = rows.find((row) => row.id === earlyId)
    const patched = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${earlyId}`,
      payload: { version: older?.version, cells: { [amountId]: 4 } },
    })
    expect(patched.statusCode).toBe(200)
    const after = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const fresh = after.json().rows as { id: string; cells: Record<string, unknown> }[]
    expect(fresh.find((row) => row.id === latestId)?.cells[totalId]).toBe(114)
    expect(fresh.find((row) => row.id === earlyId)?.cells[totalId]).toBe(114)
  })

  it('renames and recolors a status used by more than one row', async () => {
    const { tableId } = await blankTable('Statuses')
    const stage = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Stage', type: 'status' } })
    const stageId = stage.json().column.id as string
    const open = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/statuses`, payload: { name: 'Open' } })
    const done = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/statuses`, payload: { name: 'Done' } })
    const openId = open.json().status.id as string
    const first = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [stageId]: openId } } })
    const second = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [stageId]: openId } } })
    const renamed = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${tableId}/statuses/${openId}`,
      payload: { name: 'Progress' },
    })
    expect(renamed.statusCode).toBe(200)
    expect(renamed.json().status.name).toBe('Progress')
    const colored = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${tableId}/statuses/${openId}`,
      payload: { color: 'green' },
    })
    expect(colored.statusCode).toBe(200)
    expect(colored.json().status).toMatchObject({ name: 'Progress', color: 'green' })
    const listed = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const rows = listed.json().rows as { id: string; cells: Record<string, unknown> }[]
    expect(rows.find((row) => row.id === first.json().row.id)?.cells[stageId]).toBe(openId)
    expect(rows.find((row) => row.id === second.json().row.id)?.cells[stageId]).toBe(openId)
    const table = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}` })
    expect(table.json().table.statuses).toContainEqual(expect.objectContaining({ id: openId, name: 'Progress', color: 'green' }))
    const duplicate = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${tableId}/statuses/${openId}`,
      payload: { name: 'done' },
    })
    expect(duplicate.statusCode).toBe(400)
    expect(done.statusCode).toBe(200)
    const empty = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${tableId}/statuses/${openId}`,
      payload: { name: '   ' },
    })
    expect(empty.statusCode).toBe(400)
  })

  async function blankTable(name: string) {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name } })
    const projectId = project.json().project.id as string
    const table = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name } })
    return { projectId, tableId: table.json().table.id as string }
  }
})
