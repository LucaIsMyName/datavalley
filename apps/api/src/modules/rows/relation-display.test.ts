import { afterAll, describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login, type Harness } from '../../test/harness.js'

const password = 'correct horse battery'

describe('relation display titles', () => {
  let harness: Harness

  afterAll(async () => {
    await harness?.close()
  })

  it('titles a linked row from its main column, then name, then the first value, then its id', async () => {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'ada', password)).statusCode).toBe(200)
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Links' } })
    const projectId = project.json().project.id as string

    const companies = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Companies' },
    })
    const companiesId = companies.json().table.id as string
    const code = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${companiesId}/columns`,
      payload: { name: 'Code', type: 'text' },
    })
    const codeId = code.json().column.id as string
    const companyName = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${companiesId}/columns`,
      payload: { name: 'Name', type: 'text' },
    })
    const companyNameId = companyName.json().column.id as string
    const marked = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${companiesId}`,
      payload: { headerConfig: { mainColumnId: codeId } },
    })
    expect(marked.json().table.headerConfig.mainColumnId).toBe(codeId)
    const northwind = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${companiesId}/rows`,
      payload: { cells: { [codeId]: 'NW', [companyNameId]: 'Northwind' } },
    })
    const ada = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${companiesId}/rows`,
      payload: { cells: { [companyNameId]: 'Ada Lovelace' } },
    })
    const blank = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${companiesId}/rows`,
      payload: { cells: {} },
    })
    const companyRows = await session.inject({ method: 'GET', url: `/api/v1/tables/${companiesId}/rows` })
    const titled = companyRows.json().rows as { id: string; title: string }[]
    expect(titled.find((row) => row.id === northwind.json().row.id)?.title).toBe('NW')
    expect(titled.find((row) => row.id === ada.json().row.id)?.title).toBe('Ada Lovelace')
    expect(titled.find((row) => row.id === blank.json().row.id)?.title).toBe(blank.json().row.id)

    const amounts = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Amounts' },
    })
    const amountsId = amounts.json().table.id as string
    const amount = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${amountsId}/columns`,
      payload: { name: 'Amount', type: 'number' },
    })
    const amountId = amount.json().column.id as string
    const stage = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${amountsId}/columns`,
      payload: { name: 'Stage', type: 'select' },
    })
    const stageId = stage.json().column.id as string
    const option = await session.inject({
      method: 'POST',
      url: `/api/v1/columns/${stageId}/options`,
      payload: { label: 'Won' },
    })
    const optionId = option.json().option.id as string
    const numbered = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${amountsId}/rows`,
      payload: { cells: { [amountId]: 42, [stageId]: optionId } },
    })
    const staged = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${amountsId}/rows`,
      payload: { cells: { [stageId]: optionId } },
    })
    const amountRows = await session.inject({ method: 'GET', url: `/api/v1/tables/${amountsId}/rows` })
    const amountTitles = amountRows.json().rows as { id: string; title: string }[]
    expect(amountTitles.find((row) => row.id === numbered.json().row.id)?.title).toBe('42')
    expect(amountTitles.find((row) => row.id === staged.json().row.id)?.title).toBe('Won')

    const deals = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Deals' },
    })
    const dealsId = deals.json().table.id as string
    const link = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${dealsId}/relations`,
      payload: { toTableId: companiesId, cardinality: 'many_to_one', name: 'Company' },
    })
    const linkId = link.json().relation.column.id as string
    const detail = await session.inject({ method: 'GET', url: `/api/v1/tables/${dealsId}` })
    const companyColumn = (detail.json().table.columns as { id: string; config: { cardinality?: string } }[]).find(
      (column) => column.id === linkId,
    )
    expect(companyColumn?.config.cardinality).toBe('many_to_one')
    const first = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${dealsId}/rows`,
      payload: { cells: { [linkId]: northwind.json().row.id } },
    })
    const second = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${dealsId}/rows`,
      payload: { cells: { [linkId]: northwind.json().row.id } },
    })
    const linked = await session.inject({ method: 'GET', url: `/api/v1/tables/${dealsId}/rows` })
    const labels = linked.json().rows as { id: string; relationLabels: Record<string, { title: string }> }[]
    expect(labels.find((row) => row.id === first.json().row.id)?.relationLabels[linkId]?.title).toBe('NW')

    const renamed = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${companiesId}`,
      payload: { headerConfig: { mainColumnId: companyNameId } },
    })
    expect(renamed.statusCode).toBe(200)
    const retitled = await session.inject({ method: 'GET', url: `/api/v1/tables/${dealsId}/rows` })
    const nextLabels = retitled.json().rows as { id: string; relationLabels: Record<string, { title: string }> }[]
    expect(nextLabels.find((row) => row.id === first.json().row.id)?.relationLabels[linkId]?.title).toBe('Northwind')

    const rejected = await session.inject({
      method: 'POST',
      url: `/api/v1/columns/${linkId}/relation`,
      payload: { toTableId: companiesId, cardinality: 'one_to_one' },
    })
    expect(rejected.statusCode).toBe(409)

    const moved = await session.inject({
      method: 'POST',
      url: `/api/v1/columns/${linkId}/relation`,
      payload: { toTableId: amountsId, cardinality: 'many_to_one' },
    })
    expect(moved.statusCode).toBe(200)
    const cleared = await session.inject({ method: 'GET', url: `/api/v1/tables/${dealsId}/rows` })
    const dealRows = cleared.json().rows as { id: string; cells: Record<string, unknown> }[]
    expect(dealRows.find((row) => row.id === first.json().row.id)?.cells[linkId] ?? null).toBeNull()
    expect(dealRows.find((row) => row.id === second.json().row.id)?.cells[linkId] ?? null).toBeNull()

    const restored = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${companiesId}`,
      payload: { headerConfig: { mainColumnId: codeId } },
    })
    expect(restored.statusCode).toBe(200)
    const removed = await session.inject({ method: 'DELETE', url: `/api/v1/columns/${codeId}` })
    expect(removed.statusCode).toBe(200)
    const afterDelete = await session.inject({ method: 'GET', url: `/api/v1/tables/${companiesId}` })
    expect(afterDelete.json().table.headerConfig.mainColumnId).toBeUndefined()
  })
})