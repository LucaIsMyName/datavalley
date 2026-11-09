import { describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login } from './harness.js'

const password = 'correct horse battery'

describe('formula cycles', () => {
  it('flags direct and transitive cycles across columns', async () => {
    const harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, { username: 'owner', email: 'owner@example.com', password, role: 'admin' })
    const owner = await new ApiSession(harness.app).prepare()
    await login(owner, 'owner', password)

    const projectId = (await owner.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Cycles' } })).json().project.id as string
    const tableId = (await owner.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Loop' } })).json().table.id as string
    const column = async (name: string) =>
      (await owner.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name, type: 'formula' } })).json().column.id as string
    const first = await column('First')
    const second = await column('Second')
    const third = await column('Third')
    await owner.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: {} } })
    await owner.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: {} } })
    const save = async (columnId: string, expression: string) => {
      const response = await owner.inject({ method: 'POST', url: `/api/v1/columns/${columnId}/formula`, payload: { expression } })
      expect(response.statusCode).toBe(200)
      return response.json().cycle as boolean
    }

    expect(await save(first, '[First] + 1')).toBe(true)
    expect(await save(first, '[Second] + 1')).toBe(false)
    expect(await save(second, '[Third] + 1')).toBe(false)
    expect(await save(third, '[First] + 1')).toBe(true)
    expect(await save(third, '1')).toBe(false)

    await harness.close()
  })
})
