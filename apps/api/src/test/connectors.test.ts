import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { connectorRowLinks, tableConnectorBindings } from '../database/schema.js'
import { CONNECTOR_BOUND_MESSAGE } from '../modules/connectors/guard.js'
import { ApiSession, createHarness, createUser, login } from './harness.js'

describe('connectors', () => {
  it('requires admin for org-wide connector create', async () => {
    const harness = await createHarness()
    const admin = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'connadmin',
      email: 'connadmin@example.com',
      password: 'Password123!',
      role: 'admin',
    })
    const user = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'connuser',
      email: 'connuser@example.com',
      password: 'Password123!',
    })
    const adminSession = new ApiSession(harness.app)
    await adminSession.prepare()
    await login(adminSession, admin.username, 'Password123!')
    const userSession = new ApiSession(harness.app)
    await userSession.prepare()
    await login(userSession, user.username, 'Password123!')

    const denied = await userSession.inject({
      method: 'POST',
      url: '/api/v1/connectors',
      payload: {
        name: 'Feed',
        source: { baseUrl: 'https://example.com/data.json' },
        format: 'json',
        parse: { version: 1, fields: [{ sourceKey: 'id', targetFieldKey: 'id' }] },
      },
    })
    expect(denied.statusCode).toBe(403)

    const created = await adminSession.inject({
      method: 'POST',
      url: '/api/v1/connectors',
      payload: {
        name: 'Feed',
        source: { baseUrl: 'https://example.com/data.json' },
        format: 'json',
        parse: { version: 1, fields: [{ sourceKey: 'id', targetFieldKey: 'id' }] },
        retention: { mode: 'forever' },
      },
    })
    expect(created.statusCode).toBe(200)
    const body = created.json() as { connector: { id: string; name: string } }
    expect(body.connector.name).toBe('Feed')

    const list = await adminSession.inject({ method: 'GET', url: '/api/v1/connectors' })
    expect(list.json().connectors).toHaveLength(1)

    await harness.close()
  })

  it('rejects drop_missing retention without external id', async () => {
    const harness = await createHarness()
    const admin = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'retadmin',
      email: 'retadmin@example.com',
      password: 'Password123!',
      role: 'admin',
    })
    const session = new ApiSession(harness.app)
    await session.prepare()
    await login(session, admin.username, 'Password123!')
    const response = await session.inject({
      method: 'POST',
      url: '/api/v1/connectors',
      payload: {
        name: 'Bad retention',
        source: { baseUrl: 'https://example.com/data.json' },
        format: 'json',
        parse: { version: 1, fields: [{ sourceKey: 'name', targetFieldKey: 'name' }] },
        retention: { mode: 'drop_missing', missingAfterDays: 7 },
      },
    })
    expect(response.statusCode).toBe(400)
    await harness.close()
  })

  it('keeps a linked table read-only until the binding is removed', async () => {
    const harness = await createHarness()
    const admin = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'bindadmin',
      email: 'bindadmin@example.com',
      password: 'Password123!',
      role: 'admin',
    })
    const session = new ApiSession(harness.app)
    await session.prepare()
    await login(session, admin.username, 'Password123!')

    const project = await session.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'Bound' },
    })
    const projectId = project.json().project.id as string
    const table = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Feed table' },
    })
    const tableId = table.json().table.id as string
    const column = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Title', type: 'text' },
    })
    const columnId = column.json().column.id as string
    const row = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { cells: { [columnId]: 'Before' } },
    })
    const rowId = row.json().row.id as string
    const connector = await session.inject({
      method: 'POST',
      url: '/api/v1/connectors',
      payload: {
        name: 'Feed',
        source: { baseUrl: 'https://example.com/data.json' },
        format: 'json',
        parse: {
          version: 1,
          recordsPath: 'items',
          externalIdPath: 'id',
          fields: [{ sourceKey: 'name', targetFieldKey: 'name', targetLabel: 'Title' }],
        },
      },
    })
    const connectorId = connector.json().connector.id as string
    await harness.db.insert(tableConnectorBindings).values({
      tableId,
      connectorId,
      columnMap: { name: columnId },
      syncMode: 'upsert',
    })
    await harness.db.insert(connectorRowLinks).values({ tableId, externalKey: 'ext-1', rowId })

    const detail = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}` })
    expect(detail.statusCode).toBe(200)
    expect(detail.json().table.connector).toMatchObject({
      id: connectorId,
      name: 'Feed',
      lastSyncAt: null,
    })

    const blocked = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${rowId}`,
      payload: { version: 1, cells: { [columnId]: 'Edited' } },
    })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().error.message).toBe(CONNECTOR_BOUND_MESSAGE)

    const removed = await session.inject({
      method: 'DELETE',
      url: `/api/v1/tables/${tableId}/binding`,
    })
    expect(removed.statusCode).toBe(200)
    const links = await harness.db
      .select()
      .from(connectorRowLinks)
      .where(eq(connectorRowLinks.tableId, tableId))
    expect(links).toHaveLength(1)

    const unbound = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}` })
    expect(unbound.json().table.connector).toBeNull()

    const patched = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${rowId}`,
      payload: { version: 1, cells: { [columnId]: 'Edited' } },
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().row.cells[columnId]).toBe('Edited')

    await harness.close()
  })
})
