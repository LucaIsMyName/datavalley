import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { permissionGrants, tableRows } from '../database/schema.js'
import { ApiSession, createHarness, createUser, login, type Harness } from './harness.js'

const password = 'correct horse battery'

describe('search', () => {
  let harness: Harness

  beforeAll(async () => {
    harness = await createHarness()
  })

  afterAll(async () => {
    await harness?.close()
  })

  it('rejects an anonymous search', async () => {
    const response = await harness.app.inject({ method: 'GET', url: '/api/v1/search' })
    expect(response.statusCode).toBe(401)
  })

  it('groups matches and hides records the caller cannot view', async () => {
    const admin = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'admin',
      email: 'admin@example.com',
      password,
      role: 'admin',
    })
    const other = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'bea',
      email: 'bea@example.com',
      password,
    })
    const session = await new ApiSession(harness.app).prepare()
    await login(session, 'admin', password)
    const stranger = await new ApiSession(harness.app).prepare()
    await login(stranger, 'bea', password)

    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Pipeline' } })
    expect(project.statusCode).toBe(200)
    const projectId = project.json().project.id as string
    const created = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Invoices' },
    })
    const tableId = created.json().table.id as string
    const amount = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Amount', type: 'number' },
    })
    const amountId = amount.json().column.id as string
    const customer = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: '100%', type: 'text' },
    })
    const customerId = customer.json().column.id as string
    const row = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { cells: { [amountId]: 42, [customerId]: 'Acme Widgets' } },
    })
    const rowId = row.json().row.id as string
    await harness.db.update(tableRows).set({ updatedAt: new Date('2030-01-01T00:00:00.000Z') }).where(eq(tableRows.id, rowId))
    expect((await session.inject({ method: 'POST', url: '/api/v1/favorites', payload: { resourceType: 'table', resourceId: tableId } })).statusCode).toBe(200)

    const vault = await stranger.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Vault' } })
    const vaultId = vault.json().project.id as string
    const secretTable = await stranger.inject({
      method: 'POST',
      url: `/api/v1/projects/${vaultId}/tables`,
      payload: { name: 'Secrets' },
    })
    const secretTableId = secretTable.json().table.id as string
    const secretColumn = await stranger.inject({
      method: 'POST',
      url: `/api/v1/tables/${secretTableId}/columns`,
      payload: { name: 'Hidden Code', type: 'text' },
    })
    const secretColumnId = secretColumn.json().column.id as string
    await stranger.inject({
      method: 'POST',
      url: `/api/v1/tables/${secretTableId}/rows`,
      payload: { cells: { [secretColumnId]: 'SENTINEL' } },
    })

    const blank = await session.inject({ method: 'GET', url: '/api/v1/search' })
    expect(blank.statusCode).toBe(200)
    const blankBody = blank.json()
    expect(blankBody.projects).toEqual([])
    expect(blankBody.columns).toEqual([])
    expect(blankBody.rows).toEqual([])
    expect(blankBody.favorites).toEqual([])
    expect(blankBody.integrations).toEqual([])
    expect(blankBody.routes.map((hit: { id: string }) => hit.id)).toEqual([
      'dashboard',
      'projects',
      'recent',
      'favorites',
      'docs',
      'integrations',
      'profile',
      'users',
    ])
    expect(blankBody.tables[0]).toMatchObject({ id: tableId, title: 'Invoices', subtitle: 'Pipeline' })

    const german = await session.inject({ method: 'GET', url: '/api/v1/search?q=%C3%9Cbersicht&locale=de' })
    expect(german.json().routes).toContainEqual({ id: 'dashboard', title: 'Übersicht', subtitle: null, href: '/' })

    const users = await session.inject({ method: 'GET', url: '/api/v1/search?q=Users' })
    expect(users.json().routes.map((hit: { id: string }) => hit.id)).toContain('users')
    const hiddenUsers = await stranger.inject({ method: 'GET', url: '/api/v1/search?q=Users' })
    expect(hiddenUsers.json().routes.map((hit: { id: string }) => hit.id)).not.toContain('users')
    const hiddenGerman = await stranger.inject({ method: 'GET', url: '/api/v1/search?q=Benutzer&locale=de' })
    expect(hiddenGerman.json().routes.map((hit: { id: string }) => hit.id)).not.toContain('users')

    const named = await session.inject({ method: 'GET', url: '/api/v1/search?q=Pipeline' })
    expect(named.json().projects).toContainEqual(expect.objectContaining({ id: projectId, title: 'Pipeline', href: `/projects/${projectId}` }))
    const tableHit = await session.inject({ method: 'GET', url: '/api/v1/search?q=Invoices' })
    expect(tableHit.json().tables).toContainEqual(expect.objectContaining({ id: tableId, title: 'Invoices' }))
    expect(tableHit.json().favorites).toContainEqual(expect.objectContaining({ id: `table:${tableId}`, title: 'Invoices' }))
    const columnHit = await session.inject({ method: 'GET', url: '/api/v1/search?q=Amount' })
    expect(columnHit.json().columns).toContainEqual(expect.objectContaining({
      id: amountId,
      title: 'Amount',
      href: `/projects/${projectId}/tables/${tableId}?column=${amountId}`,
    }))
    const rowHit = await session.inject({ method: 'GET', url: '/api/v1/search?q=Acme' })
    expect(rowHit.json().rows).toContainEqual(expect.objectContaining({
      id: rowId,
      title: 'Acme Widgets',
      href: `/projects/${projectId}/tables/${tableId}?row=${rowId}&column=${customerId}`,
    }))
    const numberHit = await session.inject({ method: 'GET', url: '/api/v1/search?q=42' })
    expect(numberHit.json().rows.map((hit: { id: string }) => hit.id)).toContain(rowId)
    const literal = await session.inject({ method: 'GET', url: `/api/v1/search?q=${encodeURIComponent('100_')}` })
    expect(literal.json().columns.map((hit: { id: string }) => hit.id)).not.toContain(customerId)
    const percent = await session.inject({ method: 'GET', url: `/api/v1/search?q=${encodeURIComponent('100%')}` })
    expect(percent.json().columns.map((hit: { id: string }) => hit.id)).toContain(customerId)
    const plugin = await session.inject({ method: 'GET', url: '/api/v1/search?q=Sheets' })
    expect(plugin.json().integrations).toContainEqual(expect.objectContaining({ id: 'google-sheets', title: 'Google Sheets', href: '/integrations' }))

    expect((await session.inject({ method: 'GET', url: '/api/v1/search?q=Vault' })).json().projects).toEqual([])
    expect((await session.inject({ method: 'GET', url: '/api/v1/search?q=SENTINEL' })).json().rows).toEqual([])
    expect((await stranger.inject({ method: 'GET', url: '/api/v1/search?q=Acme' })).json().rows).toEqual([])

    await session.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/permissions`,
      payload: { userId: other.id, grants: [{ action: 'view', effect: 'allow' }] },
    })
    expect((await stranger.inject({ method: 'GET', url: '/api/v1/search?q=Acme' })).json().rows.map((hit: { id: string }) => hit.id)).toContain(rowId)
    expect((await stranger.inject({ method: 'GET', url: '/api/v1/search?q=Amount' })).json().columns.map((hit: { id: string }) => hit.id)).toContain(amountId)

    await harness.db.insert(permissionGrants).values({
      subjectType: 'user',
      subjectId: other.id,
      resourceType: 'column',
      resourceId: amountId,
      action: 'view',
      effect: 'deny',
    })
    expect((await stranger.inject({ method: 'GET', url: '/api/v1/search?q=Amount' })).json().columns).toEqual([])
    expect((await stranger.inject({ method: 'GET', url: '/api/v1/search?q=42' })).json().rows).toEqual([])
    expect((await stranger.inject({ method: 'GET', url: '/api/v1/search?q=Acme' })).json().rows.map((hit: { id: string }) => hit.id)).toContain(rowId)
    expect((await session.inject({ method: 'GET', url: '/api/v1/search?q=Amount' })).json().columns.map((hit: { id: string }) => hit.id)).toContain(amountId)

    await harness.db.insert(permissionGrants).values({
      subjectType: 'user',
      subjectId: other.id,
      resourceType: 'row',
      resourceId: rowId,
      action: 'view',
      effect: 'deny',
    })
    expect((await stranger.inject({ method: 'GET', url: '/api/v1/search?q=Acme' })).json().rows).toEqual([])
    expect(admin.id).toBeTruthy()
  })

  it('finds the documentation guides', async () => {
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'docs-admin',
      email: 'docs-admin@example.com',
      password,
      role: 'admin',
    })
    const session = await new ApiSession(harness.app).prepare()
    await login(session, 'docs-admin', password)
    const blank = await session.inject({ method: 'GET', url: '/api/v1/search' })
    expect(blank.json().routes.map((hit: { id: string; href: string }) => [hit.id, hit.href])).toContainEqual(['docs', '/doc/use'])
    expect((await session.inject({ method: 'GET', url: '/api/v1/search?q=User%20guide' })).json().routes).toContainEqual({
      id: 'docs-use',
      title: 'User guide',
      subtitle: null,
      href: '/doc/use',
    })
    expect((await session.inject({ method: 'GET', url: '/api/v1/search?q=Entwicklerhandbuch&locale=de' })).json().routes).toContainEqual({
      id: 'docs-develop',
      title: 'Entwicklerhandbuch',
      subtitle: null,
      href: '/doc/develop',
    })
    expect((await session.inject({ method: 'GET', url: '/api/v1/search?q=API-Referenz&locale=de' })).json().routes).toContainEqual({
      id: 'docs-api',
      title: 'API-Referenz',
      subtitle: null,
      href: '/doc/api',
    })
  })
})
