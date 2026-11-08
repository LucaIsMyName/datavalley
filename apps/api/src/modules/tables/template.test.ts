import { afterAll, describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login, type Harness } from '../../test/harness.js'

const password = 'correct horse battery'

describe('crm project template', () => {
  let harness: Harness

  afterAll(async () => {
    await harness?.close()
  })

  it('creates companies, people, and deals, and opens a deal with its links', async () => {
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
    expect(created.statusCode).toBe(200)
    const projectId = created.json().project.id as string
    const listed = await session.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    const tables = listed.json().tables as { id: string; name: string }[]
    expect(tables.map((table) => table.name).sort()).toEqual(['Companies', 'Deals', 'People', 'Tasks'])
    const dealsId = tables.find((table) => table.name === 'Deals')?.id
    const detail = await session.inject({ method: 'GET', url: `/api/v1/tables/${dealsId}` })
    const columns = detail.json().table.columns as { name: string; type: string; config: { toTableId?: string; currency?: string } }[]
    expect(columns.map((column) => column.name)).toEqual([
      'Name',
      'Stage',
      'Amount',
      'Close date',
      'Owner',
      'Company',
      'Person',
    ])
    expect(columns.find((column) => column.name === 'Amount')?.config.currency).toBe('EUR')
    expect(columns.find((column) => column.name === 'Company')?.type).toBe('relation')
    const rows = await session.inject({ method: 'GET', url: `/api/v1/tables/${dealsId}/rows` })
    const rowId = rows.json().rows[0].id as string
    const record = await session.inject({ method: 'GET', url: `/api/v1/rows/${rowId}/record` })
    expect(record.statusCode).toBe(200)
    const links = record.json().links as { title: string; columnName: string }[]
    expect(links.map((link) => `${link.columnName}:${link.title}`).sort()).toEqual([
      'Company:Northwind',
      'Deal:Follow up',
      'Person:Ada Lovelace',
    ])
    const tasksId = tables.find((table) => table.name === 'Tasks')?.id
    const taskDetail = await session.inject({ method: 'GET', url: `/api/v1/tables/${tasksId}` })
    const taskColumns = taskDetail.json().table.columns as { name: string; type: string }[]
    expect(taskColumns.map((column) => `${column.name}:${column.type}`)).toEqual([
      'Name:text',
      'Assignee:user',
      'Due:date',
      'Done:checkbox',
      'Deal:relation',
      'Person:relation',
    ])
    const work = await session.inject({ method: 'GET', url: '/api/v1/work' })
    expect(work.statusCode).toBe(200)
    const taskTitles = (work.json().tasks as { title: string }[]).map((task) => task.title)
    expect(taskTitles).toEqual(['Follow up'])
  })
})
