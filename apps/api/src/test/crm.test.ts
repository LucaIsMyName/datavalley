import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { auditLogs, tableCells, apiKeys } from '../database/schema.js'
import { createJob, runJob } from '../jobs/process.js'
import { ApiSession, createHarness, createUser, login, type Harness } from './harness.js'

const password = 'correct horse battery'

describe('crm api', () => {
  let harness: Harness

  afterAll(async () => {
    await harness?.close()
  })

  it('authenticates, isolates projects, and edits table cells', async () => {
    harness = await createHarness()
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
    const missing = await harness.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { login: 'admin', password } })
    expect(missing.statusCode).toBe(403)
    expect(missing.json().error.code).toBe('csrf_invalid')

    const bad = await login(session, 'admin', 'wrong-password-value')
    expect(bad.statusCode, JSON.stringify(bad.json())).toBe(401)
    const failures = await harness.db.select().from(auditLogs).where(eq(auditLogs.action, 'auth.login.failure'))
    expect(failures.length).toBeGreaterThan(0)

    const ok = await login(session, 'admin', password)
    expect(ok.statusCode).toBe(200)
    expect(String(ok.headers['set-cookie'])).toContain('HttpOnly')
    expect(String(ok.headers['set-cookie']).toLowerCase()).toContain('samesite=lax')
    expect((await session.inject({ method: 'GET', url: `/api/v1/users/${other.id}` })).statusCode).toBe(200)
    const stranger = await new ApiSession(harness.app).prepare()
    await login(stranger, 'bea', password)
    expect((await stranger.inject({ method: 'GET', url: `/api/v1/users/${admin.id}` })).statusCode).toBe(404)

    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Pipeline', template: 'customers' } })
    expect(project.statusCode).toBe(200)
    const projectId = project.json().project.id as string
    expect((await stranger.inject({ method: 'GET', url: `/api/v1/projects/${projectId}` })).statusCode).toBe(404)

    const created = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Invoices' },
    })
    const tableId = created.json().table.id as string
    const hidden = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Secrets' },
    })
    const hiddenId = hidden.json().table.id as string
    await session.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/permissions`,
      payload: { userId: other.id, grants: [{ action: 'view', effect: 'allow' }] },
    })
    await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/members`,
      payload: { username: 'bea' },
    })
    const amount = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Amount', type: 'number' },
    })
    const columnId = amount.json().column.id as string
    const row = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [columnId]: 42 } } })
    const rowId = row.json().row.id as string
    const saved = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${rowId}`,
      payload: { version: 1, cells: { [columnId]: 7 } },
    })
    expect(saved.statusCode).toBe(200)
    expect(saved.json().row.cells[columnId]).toBe(7)
    const conflict = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${rowId}`,
      payload: { version: 1, cells: { [columnId]: 8 } },
    })
    expect(conflict.statusCode).toBe(409)
    await session.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/permissions`,
      payload: {
        userId: other.id,
        grants: [
          { action: 'view', effect: 'allow' },
          { action: 'edit', effect: 'deny' },
        ],
      },
    })
    expect((await stranger.inject({ method: 'GET', url: `/api/v1/tables/${hiddenId}` })).statusCode).toBe(200)

    const key = await session.inject({
      method: 'POST',
      url: '/api/v1/api-keys',
      payload: { name: 'sync', scopes: [{ action: 'view', resourceType: 'project', resourceId: projectId }] },
    })
    expect(key.statusCode).toBe(200)
    const secret = key.json().apiKey.key as string
    const listed = await session.inject({ method: 'GET', url: '/api/v1/api-keys' })
    expect(JSON.stringify(listed.json())).not.toContain(secret)
    const stored = await harness.db.select().from(apiKeys)
    expect(stored[0]?.tokenHash).not.toBe(secret)

    const foreign = await stranger.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Private' } })
    const foreignProject = foreign.json().project.id as string
    const foreignTable = await stranger.inject({
      method: 'POST',
      url: `/api/v1/projects/${foreignProject}/tables`,
      payload: { name: 'Vault' },
    })
    const foreignTableId = foreignTable.json().table.id as string
    const secretColumn = await stranger.inject({
      method: 'POST',
      url: `/api/v1/tables/${foreignTableId}/columns`,
      payload: { name: 'Secret', type: 'text' },
    })
    const secretColumnId = secretColumn.json().column.id as string
    await stranger.inject({
      method: 'POST',
      url: `/api/v1/tables/${foreignTableId}/rows`,
      payload: { cells: { [secretColumnId]: 'SENTINEL-SECRET' } },
    })
    const formulaColumn = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Total', type: 'formula' },
    })
    const storedFormula = await session.inject({
      method: 'POST',
      url: `/api/v1/columns/${formulaColumn.json().column.id}/formula`,
      payload: { expression: `{${secretColumnId}}` },
    })
    expect(storedFormula.statusCode).toBe(200)
    const evaluated = await session.inject({
      method: 'POST',
      url: '/api/v1/formulas/evaluate',
      payload: { formulaId: storedFormula.json().id, rowId },
    })
    expect(evaluated.statusCode).toBe(200)
    expect(JSON.stringify(evaluated.json())).not.toContain('SENTINEL-SECRET')
    expect(evaluated.json().value).toEqual({ error: '#REF' })
    const pageRows = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows?limit=50` })
    const listedRow = pageRows.json().rows.find((item: { id: string }) => item.id === rowId)
    expect(listedRow.cells[formulaColumn.json().column.id]).toEqual({ error: '#REF' })
    expect(JSON.stringify(pageRows.json())).not.toContain('SENTINEL-SECRET')

    const doubled = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Doubled', type: 'formula' },
    })
    const doubledId = doubled.json().column.id as string
    expect((await session.inject({
      method: 'POST',
      url: `/api/v1/columns/${doubledId}/formula`,
      payload: { expression: `{${columnId}}` },
    })).statusCode).toBe(200)
    const valued = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows?limit=50` })
    expect(valued.json().rows.find((item: { id: string }) => item.id === rowId).cells[doubledId]).toBe(7)

    const relation = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/relations`,
      payload: { toTableId: hiddenId, cardinality: 'many_to_one', name: 'Customer' },
    })
    expect(relation.statusCode).toBe(200)
    expect(relation.json().relation.column.config.toTableId).toBe(hiddenId)
  })
})
