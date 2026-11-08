import { afterEach, describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login, type Harness } from '../../test/harness.js'

const password = 'correct horse battery'

describe('project roles and stage follow-ups', () => {
  let harness: Harness

  afterEach(async () => {
    await harness?.close()
  })

  it('invites a colleague by email with a read-only preset and a password link', async () => {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const admin = await new ApiSession(harness.app).prepare()
    expect((await login(admin, 'ada', password)).statusCode).toBe(200)
    const project = await admin.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'Pipeline', template: 'crm' },
    })
    const projectId = project.json().project.id as string
    const invited = await admin.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/invites`,
      payload: { email: 'bea@example.com', preset: 'view' },
    })
    expect(invited.statusCode).toBe(200)
    expect(invited.json().member.preset).toBe('view')
    const inviteUrl = invited.json().inviteUrl as string
    const token = new URL(inviteUrl).searchParams.get('token')
    const reset = await admin.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token, newPassword: 'bea chooses one' },
    })
    expect(reset.statusCode).toBe(200)
    const bea = await new ApiSession(harness.app).prepare()
    expect((await login(bea, 'bea', 'bea chooses one')).statusCode).toBe(200)
    const tables = await bea.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    const dealsId = (tables.json().tables as { id: string; name: string }[]).find((table) => table.name === 'Deals')?.id
    const rows = await bea.inject({ method: 'GET', url: `/api/v1/tables/${dealsId}/rows` })
    const deal = rows.json().rows[0] as { id: string; version: number }
    const denied = await bea.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${deal.id}`,
      payload: { version: deal.version, cells: {} },
    })
    expect(denied.statusCode).toBe(404)
    const column = await bea.inject({
      method: 'POST',
      url: `/api/v1/tables/${dealsId}/columns`,
      payload: { name: 'Note', type: 'text' },
    })
    expect(column.statusCode).toBe(404)

    const sales = await admin.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${projectId}/members/${invited.json().member.userId}`,
      payload: { preset: 'sales' },
    })
    expect(sales.statusCode).toBe(200)
    expect(sales.json().member.preset).toBe('sales')
    const detail = await bea.inject({ method: 'GET', url: `/api/v1/tables/${dealsId}` })
    const name = (detail.json().table.columns as { id: string; name: string }[]).find((column) => column.name === 'Name')
    const edited = await bea.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${deal.id}`,
      payload: { version: deal.version, cells: { [name?.id ?? '']: 'Website plus' } },
    })
    expect(edited.statusCode).toBe(200)
    const schema = await bea.inject({
      method: 'POST',
      url: `/api/v1/tables/${dealsId}/columns`,
      payload: { name: 'Note', type: 'text' },
    })
    expect(schema.statusCode).toBe(404)
  })

  it('creates a follow-up task when a deal stage changes', async () => {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'ada', password)).statusCode).toBe(200)
    const project = await session.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'Pipeline', template: 'crm' },
    })
    const projectId = project.json().project.id as string
    const listed = await session.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    const tables = listed.json().tables as { id: string; name: string }[]
    const dealsId = tables.find((table) => table.name === 'Deals')?.id
    const tasksId = tables.find((table) => table.name === 'Tasks')?.id
    const detail = await session.inject({ method: 'GET', url: `/api/v1/tables/${dealsId}` })
    const stage = (detail.json().table.columns as { id: string; name: string; options?: { id: string; label: string }[] }[]).find(
      (column) => column.name === 'Stage',
    )
    const proposal = stage?.options?.find((option) => option.label === 'Proposal')
    const rows = await session.inject({ method: 'GET', url: `/api/v1/tables/${dealsId}/rows` })
    const deal = rows.json().rows[0] as { id: string; version: number }
    const before = await session.inject({ method: 'GET', url: `/api/v1/tables/${tasksId}/rows` })
    const beforeCount = (before.json().rows as unknown[]).length
    const patched = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${deal.id}`,
      payload: { version: deal.version, cells: { [stage?.id ?? '']: proposal?.id } },
    })
    expect(patched.statusCode).toBe(200)
    const after = await session.inject({ method: 'GET', url: `/api/v1/tables/${tasksId}/rows` })
    const titles = (after.json().rows as { title: string }[]).map((row) => row.title)
    expect(after.json().rows).toHaveLength(beforeCount + 1)
    expect(titles).toContain('Follow up: Proposal')
    const again = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${deal.id}`,
      payload: { version: patched.json().row.version, cells: { [stage?.id ?? '']: proposal?.id } },
    })
    expect(again.statusCode).toBe(200)
    const stable = await session.inject({ method: 'GET', url: `/api/v1/tables/${tasksId}/rows` })
    expect(stable.json().rows).toHaveLength(beforeCount + 1)
  })
})
