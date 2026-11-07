import { describe, expect, it } from 'vitest'
import type { ProjectTransferDocument } from '@datavalley/shared'
import { ApiSession, createHarness, createUser, login, userByName } from '../../test/harness.js'
import { bindRequestGrants } from '../../security/request-context.js'
import { importProject } from './transfer.js'

const password = 'correct horse battery'

describe('project transfer', () => {
  it('exports and imports a workspace with formulas and relations', async () => {
    const harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'ada', password)).statusCode).toBe(200)

    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Transfer' } })
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
      payload: { cells: { [amountId]: 25 } },
    })
    const sourceRowId = sourceRow.json().row.id as string

    const target = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Summary' },
    })
    const targetId = target.json().table.id as string
    const total = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${targetId}/columns`,
      payload: { name: 'Total', type: 'formula' },
    })
    const totalId = total.json().column.id as string
    await session.inject({ method: 'POST', url: `/api/v1/tables/${targetId}/rows`, payload: { cells: {} } })

    expect(
      (
        await session.inject({
          method: 'POST',
          url: `/api/v1/columns/${totalId}/formula`,
          payload: { expression: 'SUM([Source -> Amount])' },
        })
      ).statusCode,
    ).toBe(200)

    const patched = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${sourceRowId}`,
      payload: { version: sourceRow.json().row.version, cells: { [amountId]: 25 } },
    })
    expect(patched.statusCode).toBe(200)

    const exported = await session.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/export` })
    expect(exported.statusCode).toBe(200)
    const document = exported.json() as ProjectTransferDocument
    expect(document.kind).toBe('datavalley.project')
    expect(document.tables.length).toBeGreaterThanOrEqual(2)
    expect(document.formulas.length).toBeGreaterThan(0)

    const imported = await session.inject({
      method: 'POST',
      url: '/api/v1/projects/import',
      payload: { name: 'Imported', document },
    })
    expect(imported.statusCode).toBe(200)
    const newProjectId = imported.json().project.id as string
    expect(imported.json().project.name).toBe('Imported')

    const tables = await session.inject({ method: 'GET', url: `/api/v1/projects/${newProjectId}/tables` })
    const summary = (tables.json().tables as { id: string; name: string }[]).find((table) => table.name === 'Summary')
    expect(summary).toBeTruthy()
    const rows = await session.inject({ method: 'GET', url: `/api/v1/tables/${summary!.id}/rows` })
    expect(rows.statusCode).toBe(200)
    const row = rows.json().rows[0] as { cells: Record<string, unknown> }
    const totalCol = (await session.inject({ method: 'GET', url: `/api/v1/tables/${summary!.id}` })).json().table
    const columnId = (totalCol.columns as { id: string; name: string }[]).find((col) => col.name === 'Total')?.id
    expect(row.cells[columnId!]).toBe(25)

    const user = await userByName(harness.db, 'ada')
    bindRequestGrants([])
    const again = await importProject(
      harness.db,
      { kind: 'user', id: user!.id, role: 'admin', source: 'web', user: user! },
      { name: 'Imported again', document },
    )
    expect(again.project.name).toBe('Imported again')

    await harness.close()
  })
})
