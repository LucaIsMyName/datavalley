import { afterAll, describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login, type Harness } from '../../test/harness.js'

const password = 'correct horse battery'

describe('field history, duplicates, and the pipeline view', () => {
  let harness: Harness

  afterAll(async () => {
    await harness?.close()
  })

  it('records a stage change, warns on a repeated email, and saves a pipeline chart', async () => {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'ada', password)).statusCode).toBe(200)
    const created = await session.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'Pipeline', template: 'crm' },
    })
    const projectId = created.json().project.id as string
    const listed = await session.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    const tables = listed.json().tables as { id: string; name: string }[]
    const dealsId = tables.find((table) => table.name === 'Deals')?.id
    const peopleId = tables.find((table) => table.name === 'People')?.id
    const dealDetail = await session.inject({ method: 'GET', url: `/api/v1/tables/${dealsId}` })
    const dealColumns = dealDetail.json().table.columns as {
      id: string
      name: string
      options?: { id: string; label: string }[]
    }[]
    const stage = dealColumns.find((column) => column.name === 'Stage')
    const won = stage?.options?.find((option) => option.label === 'Won')
    const dealRows = await session.inject({ method: 'GET', url: `/api/v1/tables/${dealsId}/rows` })
    const deal = dealRows.json().rows[0] as { id: string; version: number }
    const patched = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${deal.id}`,
      payload: { version: deal.version, cells: { [stage?.id ?? '']: won?.id } },
    })
    expect(patched.statusCode).toBe(200)
    const history = await session.inject({ method: 'GET', url: `/api/v1/rows/${deal.id}/history` })
    expect(history.statusCode).toBe(200)
    const stageChange = (history.json().entries as { columnName: string; actorName: string; before: string; after: string }[]).find(
      (entry) => entry.columnName === 'Stage',
    )
    expect(stageChange).toMatchObject({ actorName: 'ada', before: 'Qualified', after: 'Won' })

    const peopleTable = await session.inject({ method: 'GET', url: `/api/v1/tables/${peopleId}` })
    const peopleRows = await session.inject({ method: 'GET', url: `/api/v1/tables/${peopleId}/rows` })
    const person = (peopleRows.json().rows as { id: string; version: number }[])[0]
    const nameColumn = (peopleTable.json().table.columns as { id: string; name: string }[]).find((column) => column.name === 'Name')
    let version = person.version
    for (const value of ['J', 'Jo', 'John']) {
      const typed = await session.inject({
        method: 'PATCH',
        url: `/api/v1/rows/${person.id}`,
        payload: { version, cells: { [nameColumn?.id ?? '']: value } },
      })
      expect(typed.statusCode).toBe(200)
      version = typed.json().row.version as number
    }
    const personHistory = await session.inject({ method: 'GET', url: `/api/v1/rows/${person.id}/history` })
    const nameChanges = (personHistory.json().entries as { columnName: string; before: string; after: string }[]).filter(
      (entry) => entry.columnName === 'Name',
    )
    expect(nameChanges).toEqual([{ columnName: 'Name', before: 'Ada Lovelace', after: 'John' }].map((entry) => expect.objectContaining(entry)))
    const restored = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${person.id}`,
      payload: { version, cells: { [nameColumn?.id ?? '']: 'Ada Lovelace' } },
    })
    expect(restored.statusCode).toBe(200)

    const views = await session.inject({ method: 'GET', url: `/api/v1/tables/${dealsId}/views` })
    const pipeline = (views.json().views as { name: string; definition: { display: { mode: string; chart: { count: boolean } } } }[]).find(
      (view) => view.name === 'Pipeline',
    )
    expect(pipeline?.definition.display.mode).toBe('chart')
    expect(pipeline?.definition.display.chart.count).toBe(true)

    const peopleDetail = await session.inject({ method: 'GET', url: `/api/v1/tables/${peopleId}` })
    const email = (peopleDetail.json().table.columns as { id: string; name: string }[]).find((column) => column.name === 'Email')
    const boundary = '----datavalley-duplicates'
    const csv = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="headerRow"',
      '',
      'true',
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="people.csv"',
      'Content-Type: text/csv',
      '',
      'Name,Email\nSecond Ada,ada@northwind.example',
      `--${boundary}--`,
      '',
    ].join('\r\n')
    const imported = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${peopleId}/import`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: csv,
    })
    expect(imported.statusCode).toBe(200)
    const warnings = imported.json().duplicates as { columnName: string; value: string; rows: { title: string }[] }[]
    expect(warnings.map((warning) => `${warning.columnName}:${warning.value}:${warning.rows.map((row) => row.title).join(',')}`)).toEqual([
      'Email:ada@northwind.example:Ada Lovelace',
    ])
    const lookup = await session.inject({
      method: 'GET',
      url: `/api/v1/tables/${peopleId}/duplicates?columnId=${email?.id}&value=${encodeURIComponent('Ada@Northwind.example')}`,
    })
    expect(lookup.statusCode).toBe(200)
    expect((lookup.json().rows as { title: string }[]).map((row) => row.title).sort()).toEqual(['Ada Lovelace', 'Second Ada'])
  })
})