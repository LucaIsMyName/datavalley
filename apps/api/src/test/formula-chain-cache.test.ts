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

  it('refreshes a whole-column formula when an inner formula upstream changes', async () => {
    const harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'ada', password)).statusCode).toBe(200)
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Whole' } })
    const projectId = project.json().project.id as string
    const costs = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Costs' } })
    const costsId = costs.json().table.id as string
    const amount = await session.inject({ method: 'POST', url: `/api/v1/tables/${costsId}/columns`, payload: { name: 'Amount', type: 'number' } })
    const amountId = amount.json().column.id as string
    const costRow = await session.inject({ method: 'POST', url: `/api/v1/tables/${costsId}/rows`, payload: { cells: { [amountId]: 5 } } })
    const costRowId = costRow.json().row.id as string
    const invoices = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Invoices' } })
    const invoicesId = invoices.json().table.id as string
    const line = await session.inject({ method: 'POST', url: `/api/v1/tables/${invoicesId}/columns`, payload: { name: 'Line', type: 'formula' } })
    const lineId = line.json().column.id as string
    await session.inject({ method: 'POST', url: `/api/v1/tables/${invoicesId}/rows`, payload: { cells: {} } })
    expect((await session.inject({ method: 'POST', url: `/api/v1/columns/${lineId}/formula`, payload: { expression: 'SUM([Costs -> Amount])' } })).statusCode).toBe(200)
    const board = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Board' } })
    const boardId = board.json().table.id as string
    const total = await session.inject({ method: 'POST', url: `/api/v1/tables/${boardId}/columns`, payload: { name: 'Total', type: 'formula' } })
    const totalId = total.json().column.id as string
    await session.inject({ method: 'POST', url: `/api/v1/tables/${boardId}/rows`, payload: { cells: {} } })
    expect((await session.inject({ method: 'POST', url: `/api/v1/columns/${totalId}/formula`, payload: { expression: 'SUM([Invoices -> Line])' } })).statusCode).toBe(200)
    const warm = await session.inject({ method: 'GET', url: `/api/v1/tables/${boardId}/rows` })
    expect(warm.json().rows[0]?.cells[totalId]).toBe(5)
    const listed = await session.inject({ method: 'GET', url: `/api/v1/tables/${costsId}/rows` })
    const version = (listed.json().rows as { id: string; version: number }[]).find((row) => row.id === costRowId)?.version
    expect((await session.inject({ method: 'PATCH', url: `/api/v1/rows/${costRowId}`, payload: { version, cells: { [amountId]: 9 } } })).statusCode).toBe(200)
    const after = await session.inject({ method: 'GET', url: `/api/v1/tables/${boardId}/rows` })
    expect(after.json().rows[0]?.cells[totalId]).toBe(9)
    await harness.close()
  })

  it('reads a multi-select as labels and a date range as a pair', async () => {
    const harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'ada', password)).statusCode).toBe(200)
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Types' } })
    const projectId = project.json().project.id as string
    const table = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Sheet' } })
    const tableId = table.json().table.id as string
    const choice = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Choice', type: 'select', config: { multiple: true } },
    })
    const choiceId = choice.json().column.id as string
    const option = await session.inject({ method: 'POST', url: `/api/v1/columns/${choiceId}/options`, payload: { label: 'EDV' } })
    const optionId = option.json().option.id as string
    const period = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Period', type: 'date', config: { range: true } },
    })
    const periodId = period.json().column.id as string
    const flag = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'HasEdv', type: 'formula' } })
    const span = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Span', type: 'formula' } })
    const flagId = flag.json().column.id as string
    const spanId = span.json().column.id as string
    await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { cells: { [choiceId]: [optionId], [periodId]: { from: '2026-01-01', to: '2026-01-03' } } },
    })
    expect((await session.inject({ method: 'POST', url: `/api/v1/columns/${flagId}/formula`, payload: { expression: 'CONTAINS([Choice], "EDV")' } })).statusCode).toBe(200)
    expect((await session.inject({ method: 'POST', url: `/api/v1/columns/${spanId}/formula`, payload: { expression: '[Period]' } })).statusCode).toBe(200)
    const listed = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    expect(listed.json().rows[0]?.cells[flagId]).toBe(true)
    expect(listed.json().rows[0]?.cells[spanId]).toEqual(['2026-01-01', '2026-01-03'])
    await harness.close()
  })

  it('recomputes a formula after an option label is renamed', async () => {
    const harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'ada', password)).statusCode).toBe(200)
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Labels' } })
    const projectId = project.json().project.id as string
    const table = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Sheet' } })
    const tableId = table.json().table.id as string
    const priority = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Priority', type: 'select' } })
    const priorityId = priority.json().column.id as string
    const option = await session.inject({ method: 'POST', url: `/api/v1/columns/${priorityId}/options`, payload: { label: 'High' } })
    const optionId = option.json().option.id as string
    const outlook = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Outlook', type: 'formula' } })
    const outlookId = outlook.json().column.id as string
    await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [priorityId]: optionId } } })
    expect((await session.inject({ method: 'POST', url: `/api/v1/columns/${outlookId}/formula`, payload: { expression: 'IF([Priority] = "High", "yes", "no")' } })).statusCode).toBe(200)
    const warm = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    expect(warm.json().rows[0]?.cells[outlookId]).toBe('yes')
    const again = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    expect(again.json().rows[0]?.cells[outlookId]).toBe('yes')
    expect((await session.inject({ method: 'PATCH', url: `/api/v1/columns/${priorityId}/options/${optionId}`, payload: { label: 'Low' } })).statusCode).toBe(200)
    const after = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    expect(after.json().rows[0]?.cells[outlookId]).toBe('no')
    await harness.close()
  })
})
