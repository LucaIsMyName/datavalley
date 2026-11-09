import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { permissionGrants, relationRecords } from '../database/schema.js'
import { ApiSession, createHarness, createUser, login, userByName, type Harness } from './harness.js'

const password = 'correct horse battery'

describe('permission and concurrency guards', () => {
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
      username: 'bea',
      email: 'bea@example.com',
      password,
    })
    session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'ada', password)).statusCode).toBe(200)
  })

  afterAll(async () => {
    await harness?.close()
  })

  it('merges stale edits to different cells of a row and rejects a stale edit to the same cell', async () => {
    const projectId = (await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Merge' } })).json().project.id as string
    const tableId = (await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Rows' } })).json().table.id as string
    const nameId = (await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Name', type: 'text' } })).json().column.id as string
    const cityId = (await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'City', type: 'text' } })).json().column.id as string
    const created = (await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [nameId]: 'Ada' } } })).json().row
    const base = created.version as number

    const first = await session.inject({ method: 'PATCH', url: `/api/v1/rows/${created.id}`, payload: { version: base, cells: { [nameId]: 'Ada L.' } } })
    expect(first.statusCode).toBe(200)
    const second = await session.inject({ method: 'PATCH', url: `/api/v1/rows/${created.id}`, payload: { version: base, cells: { [cityId]: 'London' } } })
    expect(second.statusCode).toBe(200)
    expect(second.json().row.cells).toMatchObject({ [nameId]: 'Ada L.', [cityId]: 'London' })
    expect(second.json().row.version).toBe(base + 2)

    const notes = await session.inject({ method: 'PATCH', url: `/api/v1/rows/${created.id}`, payload: { version: base, notes: 'Met at the fair' } })
    expect(notes.statusCode).toBe(200)

    const stale = await session.inject({ method: 'PATCH', url: `/api/v1/rows/${created.id}`, payload: { version: base, cells: { [nameId]: 'Overwrite' } } })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error.details.row.cells[nameId]).toBe('Ada L.')
    const staleNotes = await session.inject({ method: 'PATCH', url: `/api/v1/rows/${created.id}`, payload: { version: base + 1, notes: 'Lost' } })
    expect(staleNotes.statusCode).toBe(409)
  })

  it('rejects fill-down when the column cannot be edited and when a row version is stale', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Fill' } })
    const projectId = project.json().project.id as string
    const table = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Rows' },
    })
    const tableId = table.json().table.id as string
    const column = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Name', type: 'text' },
    })
    const columnId = column.json().column.id as string
    const source = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { cells: { [columnId]: 'Source' } },
    })
    const keep = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { cells: { [columnId]: 'Keep' } },
    })
    const changed = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { cells: { [columnId]: 'Old' } },
    })
    const sourceId = source.json().row.id as string
    const keepId = keep.json().row.id as string
    const changedId = changed.json().row.id as string
    const bumped = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${changedId}`,
      payload: { version: changed.json().row.version, cells: { [columnId]: 'New' } },
    })
    expect(bumped.statusCode).toBe(200)

    await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/members`,
      payload: { username: 'bea', preset: 'sales' },
    })
    const bea = await userByName(harness.db, 'bea')
    await harness.db.insert(permissionGrants).values({
      subjectType: 'user',
      subjectId: bea.id,
      resourceType: 'column',
      resourceId: columnId,
      action: 'edit',
      effect: 'deny',
    })
    const sales = await new ApiSession(harness.app).prepare()
    expect((await login(sales, 'bea', password)).statusCode).toBe(200)
    const denied = await sales.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/fill`,
      payload: {
        columnId,
        rowIds: [sourceId, keepId],
        versions: { [keepId]: keep.json().row.version },
      },
    })
    expect(denied.statusCode).toBe(404)
    const afterDeny = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const keepRow = afterDeny.json().rows.find((row: { id: string }) => row.id === keepId)
    expect(keepRow.cells[columnId]).toBe('Keep')

    const stale = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/fill`,
      payload: {
        columnId,
        rowIds: [sourceId, keepId, changedId],
        versions: { [keepId]: keep.json().row.version, [changedId]: changed.json().row.version },
      },
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().error.code).toBe('version_conflict')
    const afterConflict = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const rows = afterConflict.json().rows as { id: string; cells: Record<string, string> }[]
    expect(rows.find((row) => row.id === keepId)?.cells[columnId]).toBe('Keep')
    expect(rows.find((row) => row.id === changedId)?.cells[columnId]).toBe('New')
  })

  it('omits a column the caller cannot view', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Hidden column' } })
    expect(project.statusCode, JSON.stringify(project.json())).toBe(200)
    const projectId = project.json().project.id as string
    const table = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Sheet' },
    })
    expect(table.statusCode, JSON.stringify(table.json())).toBe(200)
    const tableId = table.json().table.id as string
    const name = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Name', type: 'text' },
    })
    const secret = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Secret', type: 'text' },
    })
    const secretId = secret.json().column.id as string
    await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/members`,
      payload: { username: 'bea', preset: 'view' },
    })
    const bea = await userByName(harness.db, 'bea')
    await harness.db.insert(permissionGrants).values({
      subjectType: 'user',
      subjectId: bea.id,
      resourceType: 'column',
      resourceId: secretId,
      action: 'view',
      effect: 'deny',
    })
    const reader = await new ApiSession(harness.app).prepare()
    expect((await login(reader, 'bea', password)).statusCode).toBe(200)
    const hidden = await reader.inject({ method: 'GET', url: `/api/v1/tables/${tableId}` })
    expect(hidden.statusCode).toBe(200)
    const ids = hidden.json().table.columns.map((column: { id: string }) => column.id)
    expect(ids).toContain(name.json().column.id)
    expect(ids).not.toContain(secretId)
    const owner = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}` })
    expect(owner.json().table.columns.map((column: { id: string }) => column.id)).toContain(secretId)
  })

  it('rejects a relation link whose rows are not in the relation tables', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Links' } })
    expect(project.statusCode, JSON.stringify(project.json())).toBe(200)
    const projectId = project.json().project.id as string
    const people = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Sheet' },
    })
    expect(people.statusCode, JSON.stringify(people.json())).toBe(200)
    const companies = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Accounts' },
    })
    const other = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Extra' },
    })
    const peopleId = people.json().table.id as string
    const companiesId = companies.json().table.id as string
    const otherId = other.json().table.id as string
    const relation = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${peopleId}/relations`,
      payload: { toTableId: companiesId, cardinality: 'many_to_one', name: 'Company' },
    })
    expect(relation.statusCode).toBe(200)
    const relationId = relation.json().relation.id as string
    const person = await session.inject({ method: 'POST', url: `/api/v1/tables/${peopleId}/rows`, payload: {} })
    const company = await session.inject({ method: 'POST', url: `/api/v1/tables/${companiesId}/rows`, payload: {} })
    const stranger = await session.inject({ method: 'POST', url: `/api/v1/tables/${otherId}/rows`, payload: {} })
    const personId = person.json().row.id as string
    const companyId = company.json().row.id as string
    const strangerId = stranger.json().row.id as string
    const wrongTarget = await session.inject({
      method: 'POST',
      url: `/api/v1/relations/${relationId}/records`,
      payload: { fromRowId: personId, toRowId: strangerId },
    })
    expect(wrongTarget.statusCode).toBe(404)
    const wrongSource = await session.inject({
      method: 'POST',
      url: `/api/v1/relations/${relationId}/records`,
      payload: { fromRowId: strangerId, toRowId: companyId },
    })
    expect(wrongSource.statusCode).toBe(404)
    const links = await harness.db.select().from(relationRecords).where(eq(relationRecords.relationId, relationId))
    expect(links).toEqual([])
    const linked = await session.inject({
      method: 'POST',
      url: `/api/v1/relations/${relationId}/records`,
      payload: { fromRowId: personId, toRowId: companyId },
    })
    expect(linked.statusCode).toBe(200)
  })
})
