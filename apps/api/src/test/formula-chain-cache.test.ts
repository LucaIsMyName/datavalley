import { describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login } from './harness.js'

const password = 'correct horse battery'

describe('formula-on-formula cache', () => {
  it('recomputes a dependent formula when an upstream table changes', async () => {
    const harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'ada', password)).statusCode).toBe(200)

    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Chain' } })
    const projectId = project.json().project.id as string

    const source = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Source' },
    })
    const sourceId = source.json().table.id as string
    const amount = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${sourceId}/columns`,
      payload: { name: 'Amount', type: 'number' },
    })
    const amountId = amount.json().column.id as string
    const sourceRow = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${sourceId}/rows`,
      payload: { cells: { [amountId]: 10 } },
    })
    const sourceRowId = sourceRow.json().row.id as string

    const dashboard = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Dashboard' },
    })
    const dashboardId = dashboard.json().table.id as string
    const budget = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${dashboardId}/columns`,
      payload: { name: 'Budget', type: 'formula' },
    })
    const outlook = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${dashboardId}/columns`,
      payload: { name: 'Outlook', type: 'formula' },
    })
    const budgetId = budget.json().column.id as string
    const outlookId = outlook.json().column.id as string
    await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${dashboardId}/rows`,
      payload: { cells: {} },
    })

    expect(
      (
        await session.inject({
          method: 'POST',
          url: `/api/v1/columns/${budgetId}/formula`,
          payload: { expression: 'SUM([Source -> Amount])' },
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (
        await session.inject({
          method: 'POST',
          url: `/api/v1/columns/${outlookId}/formula`,
          payload: { expression: 'IF([Budget] > 0, "Im Budget", "Ueber")' },
        })
      ).statusCode,
    ).toBe(200)

    const warm = await session.inject({ method: 'GET', url: `/api/v1/tables/${dashboardId}/rows` })
    expect(warm.statusCode).toBe(200)
    const warmRows = warm.json().rows as { cells: Record<string, unknown> }[]
    expect(warmRows[0]?.cells[outlookId]).toBe('Im Budget')

    const warmAgain = await session.inject({ method: 'GET', url: `/api/v1/tables/${dashboardId}/rows` })
    expect(warmAgain.json().rows[0]?.cells[outlookId]).toBe('Im Budget')

    const sourceCurrent = await session.inject({ method: 'GET', url: `/api/v1/tables/${sourceId}/rows` })
    const sourceVersion = (sourceCurrent.json().rows as { id: string; version: number }[]).find(
      (row) => row.id === sourceRowId,
    )?.version
    const patched = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${sourceRowId}`,
      payload: { version: sourceVersion, cells: { [amountId]: 0 } },
    })
    expect(patched.statusCode).toBe(200)

    const after = await session.inject({ method: 'GET', url: `/api/v1/tables/${dashboardId}/rows` })
    expect(after.json().rows[0]?.cells[outlookId]).toBe('Ueber')

    await harness.close()
  })
})
