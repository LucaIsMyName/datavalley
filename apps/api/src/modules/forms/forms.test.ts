import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { connectorRowLinks, permissionGrants } from '../../database/schema.js'
import { ApiSession, createHarness, createUser, login, type Harness } from '../../test/harness.js'

const password = 'correct horse battery'

describe('public forms, quotes, and privacy', () => {
  let harness: Harness

  afterEach(async () => {
    await harness?.close()
  })

  it('creates a row from a shared form and refuses a member who cannot share', async () => {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const admin = await new ApiSession(harness.app).prepare()
    expect((await login(admin, 'ada', password)).statusCode).toBe(200)
    const project = await admin.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'Pipeline', template: 'crm' },
    })
    const projectId = project.json().project.id as string
    const tables = await admin.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/tables`,
    })
    const peopleId = (tables.json().tables as { id: string; name: string }[]).find(
      (table) => table.name === 'People',
    )?.id
    const detail = await admin.inject({ method: 'GET', url: `/api/v1/tables/${peopleId}` })
    const columns = detail.json().table.columns as { id: string; name: string }[]
    const nameId = columns.find((column) => column.name === 'Name')?.id ?? ''
    const emailId = columns.find((column) => column.name === 'Email')?.id ?? ''
    const saved = await admin.inject({
      method: 'PUT',
      url: `/api/v1/tables/${peopleId}/form`,
      payload: { columnIds: [nameId, emailId] },
    })
    expect(saved.statusCode).toBe(200)
    const token = saved.json().form.token as string
    const fields = await harness.app.inject({ method: 'GET', url: `/api/v1/public/forms/${token}` })
    expect(fields.statusCode).toBe(200)
    expect(
      fields
        .json()
        .fields.map((field: { name: string }) => field.name)
        .sort(),
    ).toEqual(['Email', 'Name'])
    const secret =
      columns.find((column) => column.name !== 'Name' && column.name !== 'Email')?.id ?? nameId
    const submitted = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/public/forms/${token}`,
      payload: {
        cells: { [nameId]: 'Grace Hopper', [emailId]: 'grace@navy.example', [secret]: 'hidden' },
      },
    })
    expect(submitted.statusCode).toBe(200)
    const row = await admin.inject({
      method: 'GET',
      url: `/api/v1/rows/${submitted.json().id}/record`,
    })
    expect(row.statusCode).toBe(200)
    expect(row.json().row.cells[nameId]).toBe('Grace Hopper')
    expect(row.json().row.cells[emailId]).toBe('grace@navy.example')
    expect(row.json().row.cells[secret]).not.toBe('hidden')

    const trapped = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/public/forms/${token}`,
      payload: { cells: { [nameId]: 'Bot' }, website: 'https://spam.example' },
    })
    expect(trapped.statusCode).toBe(400)
    const limited = await admin.inject({
      method: 'PUT',
      url: `/api/v1/tables/${peopleId}/form`,
      payload: { columnIds: [nameId, emailId], dailyLimit: 2 },
    })
    expect(limited.json().form).toMatchObject({ token, dailyLimit: 2 })
    const second = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/public/forms/${token}`,
      payload: { cells: { [nameId]: 'Second' } },
    })
    expect(second.statusCode).toBe(200)
    const third = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/public/forms/${token}`,
      payload: { cells: { [nameId]: 'Third' } },
    })
    expect(third.statusCode).toBe(429)
    expect(third.json().error.code).toBe('rate_limited')

    const invited = await admin.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/invites`,
      payload: { email: 'bea@example.com', preset: 'view' },
    })
    const tokenLink = new URL(invited.json().inviteUrl as string).searchParams.get('token')
    await admin.inject({
      method: 'POST',
      url: '/api/v1/auth/reset-password',
      payload: { token: tokenLink, newPassword: 'bea chooses one' },
    })
    const bea = await new ApiSession(harness.app).prepare()
    expect((await login(bea, 'bea', 'bea chooses one')).statusCode).toBe(200)
    const denied = await bea.inject({
      method: 'PUT',
      url: `/api/v1/tables/${peopleId}/form`,
      payload: { columnIds: [nameId] },
    })
    expect(denied.statusCode).toBe(404)
  })

  it('prints a quote total from its product lines', async () => {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'ada', password)).statusCode).toBe(200)
    const project = await session.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'Offers', template: 'quotes' },
    })
    const projectId = project.json().project.id as string
    const listed = await session.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/tables`,
    })
    expect((listed.json().tables as { name: string }[]).map((table) => table.name).sort()).toEqual([
      'Lines',
      'Products',
      'Quotes',
    ])
    const quotesId = (listed.json().tables as { id: string; name: string }[]).find(
      (table) => table.name === 'Quotes',
    )?.id
    const rows = await session.inject({ method: 'GET', url: `/api/v1/tables/${quotesId}/rows` })
    const quote = await session.inject({
      method: 'GET',
      url: `/api/v1/rows/${rows.json().rows[0].id}/quote`,
    })
    expect(quote.statusCode).toBe(200)
    expect(quote.json()).toMatchObject({
      title: 'Northwind site',
      status: 'Draft',
      customer: 'Northwind',
      total: 1000,
    })
    expect(quote.json().lines).toEqual([
      { product: 'Workshop', quantity: 2, price: 500, amount: 1000 },
    ])

    const quoteColumns = await renameColumns(session, quotesId ?? '')
    const linesId = (listed.json().tables as { id: string; name: string }[]).find(
      (table) => table.name === 'Lines',
    )?.id
    const productsId = (listed.json().tables as { id: string; name: string }[]).find(
      (table) => table.name === 'Products',
    )?.id
    await renameColumns(session, linesId ?? '')
    await renameColumns(session, productsId ?? '')
    const renamed = await session.inject({
      method: 'GET',
      url: `/api/v1/rows/${rows.json().rows[0].id}/quote`,
    })
    expect(renamed.statusCode).toBe(200)
    expect(renamed.json()).toMatchObject({
      title: 'Northwind site',
      status: 'Draft',
      customer: 'Northwind',
      total: 1000,
    })

    const products = await session.inject({
      method: 'GET',
      url: `/api/v1/tables/${productsId}/rows`,
    })
    const productQuote = await session.inject({
      method: 'GET',
      url: `/api/v1/rows/${products.json().rows[0].id}/quote`,
    })
    expect(productQuote.statusCode).toBe(404)

    const statusId = quoteColumns.find((column) => column.name === 'Status')?.id
    expect(
      (await session.inject({ method: 'DELETE', url: `/api/v1/columns/${statusId}` })).statusCode,
    ).toBe(200)
    expect(
      (await session.inject({ method: 'GET', url: `/api/v1/rows/${rows.json().rows[0].id}/quote` }))
        .statusCode,
    ).toBe(404)

    const cleared = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${quotesId}`,
      payload: { documentConfig: {} },
    })
    expect(cleared.statusCode).toBe(200)
    expect(cleared.json().table.documentConfig).toEqual({})
    expect(
      (await session.inject({ method: 'GET', url: `/api/v1/rows/${rows.json().rows[0].id}/quote` }))
        .statusCode,
    ).toBe(404)
  })

  it('exports a person with related rows and deletes them unless a connector owns the row', async () => {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'ada', password)).statusCode).toBe(200)
    const project = await session.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'Pipeline', template: 'crm' },
    })
    const projectId = project.json().project.id as string
    const listed = await session.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/tables`,
    })
    const tables = listed.json().tables as { id: string; name: string }[]
    const peopleId = tables.find((table) => table.name === 'People')?.id
    const people = await session.inject({ method: 'GET', url: `/api/v1/tables/${peopleId}/rows` })
    const personId = people.json().rows[0].id as string
    const exported = await session.inject({
      method: 'GET',
      url: `/api/v1/rows/${personId}/privacy`,
    })
    expect(exported.statusCode).toBe(200)
    const related = exported.json().related as {
      table: string
      title: string
      connector: boolean
    }[]
    expect(related.map((item) => item.table).sort()).toEqual([
      'Companies',
      'Deals',
      'Meetings',
      'Tasks',
    ])
    expect(exported.json().row.connector).toBe(false)
    const removed = await session.inject({
      method: 'DELETE',
      url: `/api/v1/rows/${personId}/privacy`,
    })
    expect(removed.statusCode).toBe(200)
    expect(removed.json()).toEqual({ removed: true, connector: false })
    const gone = await session.inject({ method: 'GET', url: `/api/v1/rows/${personId}/record` })
    expect(gone.statusCode).toBe(404)

    const dealsId = tables.find((table) => table.name === 'Deals')?.id
    const deals = await session.inject({ method: 'GET', url: `/api/v1/tables/${dealsId}/rows` })
    const dealId = deals.json().rows[0].id as string
    await harness.db
      .insert(connectorRowLinks)
      .values({ tableId: dealsId ?? '', externalKey: 'deal-1', rowId: dealId })
    const kept = await session.inject({ method: 'DELETE', url: `/api/v1/rows/${dealId}/privacy` })
    expect(kept.json()).toEqual({ removed: false, connector: true })
    const still = await session.inject({ method: 'GET', url: `/api/v1/rows/${dealId}/record` })
    expect(still.statusCode).toBe(200)
    const links = await harness.db
      .select()
      .from(connectorRowLinks)
      .where(eq(connectorRowLinks.rowId, dealId))
    expect(links).toHaveLength(1)
  })

  it('hides a person and related rows the member cannot view', async () => {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const bea = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'bea',
      email: 'bea@example.com',
      password,
    })
    const admin = await new ApiSession(harness.app).prepare()
    expect((await login(admin, 'ada', password)).statusCode).toBe(200)
    const member = await new ApiSession(harness.app).prepare()
    expect((await login(member, 'bea', password)).statusCode).toBe(200)
    const project = await admin.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'Pipeline', template: 'crm' },
    })
    const projectId = project.json().project.id as string
    expect(
      (
        await admin.inject({
          method: 'PUT',
          url: `/api/v1/projects/${projectId}/permissions`,
          payload: { userId: bea.id, grants: [{ action: 'view', effect: 'allow' }] },
        })
      ).statusCode,
    ).toBe(200)
    const listed = await admin.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    const tables = listed.json().tables as { id: string; name: string }[]
    const peopleId = tables.find((table) => table.name === 'People')?.id
    const dealsId = tables.find((table) => table.name === 'Deals')?.id
    const people = await admin.inject({ method: 'GET', url: `/api/v1/tables/${peopleId}/rows` })
    const personId = people.json().rows[0].id as string
    const deals = await admin.inject({ method: 'GET', url: `/api/v1/tables/${dealsId}/rows` })
    const dealRows = deals.json().rows as { id: string; cells: Record<string, string> }[]
    const dealDetail = await admin.inject({ method: 'GET', url: `/api/v1/tables/${dealsId}` })
    const personColumn = (dealDetail.json().table.columns as { id: string; name: string }[]).find(
      (column) => column.name === 'Person',
    )?.id
    const dealId = dealRows.find((row) => row.cells[personColumn ?? ''] === personId)?.id ?? dealRows[0].id
    await harness.db.insert(permissionGrants).values({
      subjectType: 'user',
      subjectId: bea.id,
      resourceType: 'row',
      resourceId: dealId,
      action: 'view',
      effect: 'deny',
    })

    const exported = await member.inject({ method: 'GET', url: `/api/v1/rows/${personId}/privacy` })
    expect(exported.statusCode).toBe(200)
    const body = JSON.stringify(exported.json())
    expect(body).not.toContain(dealId)
    expect(exported.json().related.map((item: { id: string }) => item.id)).not.toContain(dealId)

    await harness.db.insert(permissionGrants).values({
      subjectType: 'user',
      subjectId: bea.id,
      resourceType: 'row',
      resourceId: personId,
      action: 'view',
      effect: 'deny',
    })
    expect((await member.inject({ method: 'GET', url: `/api/v1/rows/${personId}/privacy` })).statusCode).toBe(404)
    await harness.db.insert(permissionGrants).values({
      subjectType: 'user',
      subjectId: bea.id,
      resourceType: 'row',
      resourceId: personId,
      action: 'delete',
      effect: 'deny',
    })
    expect((await member.inject({ method: 'DELETE', url: `/api/v1/rows/${personId}/privacy` })).statusCode).toBe(404)
    expect((await admin.inject({ method: 'GET', url: `/api/v1/rows/${personId}/record` })).statusCode).toBe(200)
  })
})

async function renameColumns(session: ApiSession, tableId: string) {
  const detail = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}` })
  const columns = detail.json().table.columns as { id: string; name: string }[]
  for (const column of columns) {
    const renamed = await session.inject({
      method: 'PATCH',
      url: `/api/v1/columns/${column.id}`,
      payload: { name: `Field ${column.name}` },
    })
    expect(renamed.statusCode).toBe(200)
  }
  return columns
}
