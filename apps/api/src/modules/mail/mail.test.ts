import { afterAll, describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login, type Harness } from '../../test/harness.js'

const password = 'correct horse battery'

describe('mail on a record', () => {
  let harness: Harness

  afterAll(async () => {
    await harness?.close()
  })

  it('stores a template, sends from a deal, and shows the log on the person', async () => {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'bea',
      email: 'bea@example.com',
      password,
      role: 'user',
    })
    const admin = await new ApiSession(harness.app).prepare()
    expect((await login(admin, 'ada', password)).statusCode).toBe(200)
    const member = await new ApiSession(harness.app).prepare()
    expect((await login(member, 'bea', password)).statusCode).toBe(200)

    const denied = await member.inject({
      method: 'POST',
      url: '/api/v1/mail/templates',
      payload: { name: 'Follow up', subject: 'Hello {{Name}}', body: 'About {{Person}}' },
    })
    expect(denied.statusCode).toBe(403)

    const created = await admin.inject({
      method: 'POST',
      url: '/api/v1/mail/templates',
      payload: { name: 'Follow up', subject: 'Hello {{Name}}', body: 'About {{Person}} at {{Stage}}' },
    })
    expect(created.statusCode).toBe(200)
    const templateId = created.json().template.id as string

    const project = await admin.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'Pipeline', template: 'crm' },
    })
    const projectId = project.json().project.id as string
    const listed = await admin.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    const tables = listed.json().tables as { id: string; name: string }[]
    const dealsId = tables.find((table) => table.name === 'Deals')?.id
    const detail = await admin.inject({ method: 'GET', url: `/api/v1/tables/${dealsId}` })
    const columns = detail.json().table.columns as { id: string; name: string }[]
    const personColumn = columns.find((column) => column.name === 'Person')?.id ?? ''
    const rows = await admin.inject({ method: 'GET', url: `/api/v1/tables/${dealsId}/rows` })
    const deal = rows.json().rows[0] as { id: string; cells: Record<string, string> }
    const personRowId = deal.cells[personColumn]

    const preview = await admin.inject({ method: 'GET', url: `/api/v1/rows/${deal.id}/mail` })
    expect(preview.statusCode).toBe(200)
    expect(preview.json().recipients.map((item: { address: string }) => item.address)).toEqual(['ada@northwind.example'])
    expect(preview.json().fields.Name).toBe('Website')
    expect(preview.json().fields.Person).toBe('Ada Lovelace')

    const sent = await admin.inject({
      method: 'POST',
      url: `/api/v1/rows/${deal.id}/mail`,
      payload: {
        to: 'ada@northwind.example',
        subject: 'Hello {{Name}}',
        body: 'About {{Person}} at {{Stage}}',
        templateId,
      },
    })
    expect(sent.statusCode).toBe(200)
    expect(sent.json().message.subject).toBe('Hello Website')
    expect(sent.json().message.body).toBe('About Ada Lovelace at Qualified')
    expect(sent.json().message.relatedRowId).toBe(personRowId)

    const onDeal = await admin.inject({ method: 'GET', url: `/api/v1/rows/${deal.id}/mail` })
    expect(onDeal.json().messages.map((item: { subject: string }) => item.subject)).toEqual(['Hello Website'])
    const onPerson = await admin.inject({ method: 'GET', url: `/api/v1/rows/${personRowId}/mail` })
    expect(onPerson.json().messages.map((item: { subject: string }) => item.subject)).toEqual(['Hello Website'])
  })
})
