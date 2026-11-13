import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login, type Harness } from './harness.js'

const password = 'correct horse battery'

type CatalogColumn = {
  tableId: string
  tableName: string
  columnId: string
  columnName: string
  projectName: string
}

type CatalogRelation = {
  name: string
  toTableId: string
  toTableName: string
  toProjectName: string
  columns: { id: string; name: string }[]
}

describe('formula catalog mirrors', () => {
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
    expect((await login(session, 'ada', password)).statusCode).toBe(200)
  })

  afterAll(async () => {
    await harness?.close()
  })

  it('lists a mirror under its own name and reads the source columns', async () => {
    const sourceProject = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Source' } })
    const sourceProjectId = sourceProject.json().project.id as string
    const sourceTable = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${sourceProjectId}/tables`,
      payload: { name: 'Inventory' },
    })
    const sourceTableId = sourceTable.json().table.id as string
    const column = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${sourceTableId}/columns`,
      payload: { name: 'SKU', type: 'text' },
    })
    const columnId = column.json().column.id as string
    await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${sourceTableId}/rows`,
      payload: { cells: { [columnId]: 'ABC-1' } },
    })

    const hostProject = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Host' } })
    const hostProjectId = hostProject.json().project.id as string
    const mirror = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${hostProjectId}/tables/mirror`,
      payload: { sourceTableId, name: 'Inventory view' },
    })
    const mirrorId = mirror.json().table.id as string

    const listed = await session.inject({ method: 'GET', url: `/api/v1/tables/${mirrorId}/formula-catalog` })
    expect(listed.statusCode).toBe(200)
    const columns = listed.json().columns as CatalogColumn[]
    const sku = columns.find((item) => item.columnName === 'SKU')
    expect(sku).toMatchObject({
      tableId: mirrorId,
      tableName: 'Inventory view',
      columnId,
      projectName: 'Host',
    })
    expect(columns.some((item) => item.tableName === 'Inventory')).toBe(false)

    const rows = await session.inject({ method: 'GET', url: `/api/v1/tables/${mirrorId}/rows` })
    const rowId = rows.json().rows[0].id as string
    const preview = await session.inject({
      method: 'POST',
      url: '/api/v1/formulas/validate',
      payload: { tableId: mirrorId, rowId, expression: '[SKU]' },
    })
    expect(preview.statusCode).toBe(200)
    expect(preview.json().value).toBe('ABC-1')

    const orders = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${hostProjectId}/tables`,
      payload: { name: 'Orders' },
    })
    const ordersId = orders.json().table.id as string
    const link = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${ordersId}/relations`,
      payload: { toTableId: mirrorId, cardinality: 'many_to_one', name: 'Stock' },
    })
    expect(link.statusCode).toBe(200)
    const related = await session.inject({ method: 'GET', url: `/api/v1/tables/${ordersId}/formula-catalog` })
    const relation = (related.json().relations as CatalogRelation[]).find((item) => item.name === 'Stock')
    expect(relation).toMatchObject({
      toTableId: mirrorId,
      toTableName: 'Inventory view',
      toProjectName: 'Host',
      columns: [{ id: columnId, name: 'SKU' }],
    })
  })
})
