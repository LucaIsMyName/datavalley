import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { auditLogs, connectorRowLinks, relationRecords, relations, tableConnectorBindings, tableRows } from '../database/schema.js'
import { CONNECTOR_BOUND_MESSAGE } from '../modules/connectors/guard.js'
import { executeConnectorSyncJob, setConnectorSyncFetchForTests } from '../modules/connectors/sync.js'
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
    const listed = await session.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    const listedTable = (listed.json().tables as { id: string; connector: { name: string } | null }[]).find(
      (item) => item.id === tableId,
    )
    expect(listedTable?.connector?.name).toBe('Feed')

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
    const listedAgain = await session.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    const unboundListed = (listedAgain.json().tables as { id: string; connector: { name: string } | null }[]).find(
      (item) => item.id === tableId,
    )
    expect(unboundListed?.connector).toBeNull()

    const patched = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${rowId}`,
      payload: { version: 1, cells: { [columnId]: 'Edited' } },
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().row.cells[columnId]).toBe('Edited')

    await harness.close()
  })

  it('bumps synced row versions and skips retention when a relation restricts delete', async () => {
    const harness = await createHarness()
    const admin = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'syncadmin',
      email: 'syncadmin@example.com',
      password: 'Password123!',
      role: 'admin',
    })
    const session = new ApiSession(harness.app)
    await session.prepare()
    await login(session, admin.username, 'Password123!')
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Sync' } })
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
    const notes = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Notes' },
    })
    const notesId = notes.json().table.id as string
    const noteRow = await session.inject({ method: 'POST', url: `/api/v1/tables/${notesId}/rows`, payload: { cells: {} } })
    const noteRowId = noteRow.json().row.id as string
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
        retention: { mode: 'drop_missing', missingAfterDays: 7 },
      },
    })
    const connectorId = connector.json().connector.id as string
    await harness.db.insert(tableConnectorBindings).values({
      tableId,
      connectorId,
      columnMap: { name: columnId },
      syncMode: 'upsert',
    })

    try {
      setConnectorSyncFetchForTests(async () => JSON.stringify({ items: [{ id: 'ext-1', name: 'Ada' }] }))
      const imported = await executeConnectorSyncJob(harness.db, harness.env, {
        connectorId,
        tableId,
        actorUserId: admin.id,
      })
      expect(imported.imported).toBe(1)
      const [created] = await harness.db.select().from(tableRows).where(eq(tableRows.tableId, tableId))
      expect(created.version).toBe(2)

      setConnectorSyncFetchForTests(async () => JSON.stringify({ items: [{ id: 'ext-1', name: 'Ada Lovelace' }] }))
      const updated = await executeConnectorSyncJob(harness.db, harness.env, {
        connectorId,
        tableId,
        actorUserId: admin.id,
      })
      expect(updated.updated).toBe(1)
      const [revised] = await harness.db.select().from(tableRows).where(eq(tableRows.id, created.id))
      expect(revised.version).toBe(3)
      const listed = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
      expect(listed.json().rows[0].cells[columnId]).toBe('Ada Lovelace')

      await harness.db
        .update(connectorRowLinks)
        .set({ lastSeenAt: new Date(Date.now() - 10 * 86_400_000) })
        .where(eq(connectorRowLinks.rowId, created.id))
      const [relation] = await harness.db
        .insert(relations)
        .values({ fromTableId: notesId, toTableId: tableId, cardinality: 'many_to_one', onDelete: 'restrict' })
        .returning()
      await harness.db.insert(relationRecords).values({
        relationId: relation.id,
        fromRowId: noteRowId,
        toRowId: created.id,
      })
      setConnectorSyncFetchForTests(async () => JSON.stringify({ items: [] }))
      const kept = await executeConnectorSyncJob(harness.db, harness.env, {
        connectorId,
        tableId,
        actorUserId: admin.id,
      })
      expect(kept.deleted).toBe(0)
      expect(await harness.db.select().from(tableRows).where(eq(tableRows.id, created.id))).toHaveLength(1)

      await harness.db.delete(relationRecords).where(eq(relationRecords.relationId, relation.id))
      const dropped = await executeConnectorSyncJob(harness.db, harness.env, {
        connectorId,
        tableId,
        actorUserId: admin.id,
      })
      expect(dropped.deleted).toBe(1)
      expect(await harness.db.select().from(tableRows).where(eq(tableRows.id, created.id))).toHaveLength(0)
      const audits = await harness.db.select().from(auditLogs).where(eq(auditLogs.resourceId, created.id))
      expect(audits.map((entry) => entry.action)).toContain('row.delete')
    } finally {
      setConnectorSyncFetchForTests(null)
      await harness.close()
    }
  })
})
