import { describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login } from './harness.js'

const password = 'correct horse battery'

describe('formula batch evaluation', () => {
  it('lists row formulas via batch evaluation and reuses cache on repeat load', async () => {
    const harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'ada', password)).statusCode).toBe(200)

    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Batch' } })
    const projectId = project.json().project.id as string
    const table = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Sheet' },
    })
    const tableId = table.json().table.id as string
    const amount = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Amount', type: 'number' },
    })
    const total = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Total', type: 'formula' },
    })
    const amountId = amount.json().column.id as string
    const totalId = total.json().column.id as string
    const row = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { cells: { [amountId]: 7 } },
    })
    const rowId = row.json().row.id as string
    await session.inject({
      method: 'POST',
      url: `/api/v1/columns/${totalId}/formula`,
      payload: { expression: 'Amount * 3' },
    })
    await session.inject({
      method: 'POST',
      url: `/api/v1/rows/${rowId}/columns/${totalId}/formula`,
      payload: { expression: 'Amount + 2' },
    })

    const listed = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    expect(listed.statusCode).toBe(200)
    expect(listed.json().rows[0].cells[totalId]).toBe(9)

    const again = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    expect(again.json().rows[0].cells[totalId]).toBe(9)

    await harness.close()
  })
})
