import { describe, expect, it } from 'vitest'
import { permissionGrants } from '../database/schema.js'
import { ApiSession, createHarness, createUser, login } from './harness.js'

const password = 'correct horse battery'

describe('formulas and row-level deny grants', () => {
  it('leaves rows hidden from a member out of aggregates, lookups, and the shared cache', async () => {
    const harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, { username: 'owner', email: 'owner@example.com', password, role: 'admin' })
    const viewer = await createUser(harness.db, harness.env, harness.organizationId, { username: 'viewer', email: 'viewer@example.com', password })
    const owner = await new ApiSession(harness.app).prepare()
    await login(owner, 'owner', password)
    const member = await new ApiSession(harness.app).prepare()
    await login(member, 'viewer', password)

    const projectId = (await owner.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Deals' } })).json().project.id as string
    const sourceId = (await owner.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Source' } })).json().table.id as string
    const amountId = (await owner.inject({ method: 'POST', url: `/api/v1/tables/${sourceId}/columns`, payload: { name: 'Amount', type: 'number' } })).json().column.id as string
    const nameId = (await owner.inject({ method: 'POST', url: `/api/v1/tables/${sourceId}/columns`, payload: { name: 'Label', type: 'text' } })).json().column.id as string
    const allId = (await owner.inject({ method: 'POST', url: `/api/v1/tables/${sourceId}/columns`, payload: { name: 'All', type: 'formula' } })).json().column.id as string
    await owner.inject({ method: 'POST', url: `/api/v1/tables/${sourceId}/rows`, payload: { cells: { [amountId]: 10, [nameId]: 'open' } } })
    const hidden = (await owner.inject({ method: 'POST', url: `/api/v1/tables/${sourceId}/rows`, payload: { cells: { [amountId]: 32, [nameId]: 'secret' } } })).json().row.id as string
    expect((await owner.inject({ method: 'POST', url: `/api/v1/columns/${allId}/formula`, payload: { expression: 'SUM([Source -> Amount])' } })).statusCode).toBe(200)

    const summaryId = (await owner.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Summary' } })).json().table.id as string
    const totalId = (await owner.inject({ method: 'POST', url: `/api/v1/tables/${summaryId}/columns`, payload: { name: 'Total', type: 'formula' } })).json().column.id as string
    const secretId = (await owner.inject({ method: 'POST', url: `/api/v1/tables/${summaryId}/columns`, payload: { name: 'Secret', type: 'formula' } })).json().column.id as string
    await owner.inject({ method: 'POST', url: `/api/v1/tables/${summaryId}/rows`, payload: { cells: {} } })
    expect((await owner.inject({ method: 'POST', url: `/api/v1/columns/${totalId}/formula`, payload: { expression: 'SUM([Source -> Amount])' } })).statusCode).toBe(200)
    expect((await owner.inject({ method: 'POST', url: `/api/v1/columns/${secretId}/formula`, payload: { expression: 'SUMIF([Source -> Label], "secret", [Source -> Amount])' } })).statusCode).toBe(200)

    await owner.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/permissions`,
      payload: { userId: viewer.id, grants: [{ action: 'view', effect: 'allow' }] },
    })
    await harness.db.insert(permissionGrants).values({
      subjectType: 'user',
      subjectId: viewer.id,
      resourceType: 'row',
      resourceId: hidden,
      action: 'view',
      effect: 'deny',
    })

    const ownerSummary = (await owner.inject({ method: 'GET', url: `/api/v1/tables/${summaryId}/rows` })).json().rows[0].cells
    expect(ownerSummary[totalId]).toBe(42)
    expect(ownerSummary[secretId]).toBe(32)
    const ownerSource = (await owner.inject({ method: 'GET', url: `/api/v1/tables/${sourceId}/rows` })).json().rows
    expect(ownerSource.map((row: { cells: Record<string, unknown> }) => row.cells[allId])).toEqual([42, 42])

    const memberSummary = (await member.inject({ method: 'GET', url: `/api/v1/tables/${summaryId}/rows` })).json().rows[0].cells
    expect(memberSummary[totalId]).toBe(10)
    expect(memberSummary[secretId]).toBe(0)
    const memberSource = (await member.inject({ method: 'GET', url: `/api/v1/tables/${sourceId}/rows` })).json().rows
    expect(memberSource).toHaveLength(1)
    expect(memberSource[0].cells[allId]).toBe(10)

    await harness.close()
  })
})
