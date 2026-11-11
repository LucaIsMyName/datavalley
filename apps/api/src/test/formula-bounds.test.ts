import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { LIMITS } from '@datavalley/formula-engine'
import { formulaCache, formulas } from '../database/schema.js'
import { ApiSession, createHarness, createUser, login } from './harness.js'

const password = 'correct horse battery'

async function session() {
  const harness = await createHarness()
  await createUser(harness.db, harness.env, harness.organizationId, {
    username: 'ada',
    email: 'ada@example.com',
    password,
    role: 'admin',
  })
  const client = await new ApiSession(harness.app).prepare()
  expect((await login(client, 'ada', password)).statusCode).toBe(200)
  const project = await client.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Bounds' } })
  return { harness, client, projectId: project.json().project.id as string }
}

describe('formula bounds', () => {
  it('calculates SUM, MIN, MAX, and COUNT without reading the unread IF branch', async () => {
    const { harness, client, projectId } = await session()
    const source = await client.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Source' },
    })
    const sourceId = source.json().table.id as string
    const amount = await client.inject({
      method: 'POST',
      url: `/api/v1/tables/${sourceId}/columns`,
      payload: { name: 'Amount', type: 'number' },
    })
    const amountId = amount.json().column.id as string
    const heavy = await client.inject({
      method: 'POST',
      url: `/api/v1/tables/${sourceId}/columns`,
      payload: { name: 'Heavy', type: 'formula' },
    })
    const heavyId = heavy.json().column.id as string
    for (const value of [2, 8, 5]) {
      await client.inject({ method: 'POST', url: `/api/v1/tables/${sourceId}/rows`, payload: { cells: { [amountId]: value } } })
    }
    expect((await client.inject({ method: 'POST', url: `/api/v1/columns/${heavyId}/formula`, payload: { expression: '1' } })).statusCode).toBe(200)

    const board = await client.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Board' },
    })
    const boardId = board.json().table.id as string
    const names = ['Total', 'Lowest', 'Highest', 'Filled', 'Choice'] as const
    const columnIds: Record<(typeof names)[number], string> = { Total: '', Lowest: '', Highest: '', Filled: '', Choice: '' }
    for (const name of names) {
      const created = await client.inject({
        method: 'POST',
        url: `/api/v1/tables/${boardId}/columns`,
        payload: { name, type: 'formula' },
      })
      columnIds[name] = created.json().column.id as string
    }
    await client.inject({ method: 'POST', url: `/api/v1/tables/${boardId}/rows`, payload: { cells: {} } })
    const expressions: Record<(typeof names)[number], string> = {
      Total: 'SUM([Source -> Amount])',
      Lowest: 'MIN([Source -> Amount])',
      Highest: 'MAX([Source -> Amount])',
      Filled: 'COUNT([Source -> Amount])',
      Choice: 'IF(0, [Source -> Heavy], 9)',
    }
    for (const name of names) {
      expect(
        (await client.inject({ method: 'POST', url: `/api/v1/columns/${columnIds[name]}/formula`, payload: { expression: expressions[name] } })).statusCode,
      ).toBe(200)
    }
    const listed = await client.inject({ method: 'GET', url: `/api/v1/tables/${boardId}/rows` })
    const cells = listed.json().rows[0]?.cells as Record<string, unknown>
    expect(cells[columnIds.Total]).toBe(15)
    expect(cells[columnIds.Lowest]).toBe(2)
    expect(cells[columnIds.Highest]).toBe(8)
    expect(cells[columnIds.Filled]).toBe(3)
    expect(cells[columnIds.Choice]).toBe(9)
    const stored = await harness.db.select().from(formulas).where(eq(formulas.columnId, heavyId))
    const heavyFormulaId = stored[0]?.id
    expect(heavyFormulaId).toBeTruthy()
    const cached = await harness.db.select().from(formulaCache).where(eq(formulaCache.formulaId, heavyFormulaId ?? ''))
    expect(cached).toHaveLength(0)
    await harness.close()
  })

  it('stops a formula chain at the shared dependency depth', async () => {
    const { harness, client, projectId } = await session()
    const table = await client.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Chain' },
    })
    const tableId = table.json().table.id as string
    const ids: string[] = []
    for (let index = 0; index <= LIMITS.maxDependencyDepth + 1; index += 1) {
      const created = await client.inject({
        method: 'POST',
        url: `/api/v1/tables/${tableId}/columns`,
        payload: { name: `Step${index}`, type: 'formula' },
      })
      ids.push(created.json().column.id as string)
    }
    await client.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: {} } })
    for (let index = 0; index < ids.length; index += 1) {
      const expression = index === 0 ? '1' : `[Step${index - 1}]`
      const saved = await client.inject({
        method: 'POST',
        url: `/api/v1/columns/${ids[index]}/formula`,
        payload: { expression },
      })
      expect(saved.statusCode).toBe(200)
    }
    const listed = await client.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/rows` })
    const cells = listed.json().rows[0]?.cells as Record<string, unknown>
    expect(cells[ids[LIMITS.maxDependencyDepth] ?? '']).toBe(1)
    expect(cells[ids[LIMITS.maxDependencyDepth + 1] ?? '']).toEqual({ error: '#LIM' })
    await harness.close()
  })
})
