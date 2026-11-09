import { describe, expect, it } from 'vitest'
import { permissionGrants } from '../../database/schema.js'
import { ApiSession, createHarness, createUser, login } from '../../test/harness.js'

const password = 'correct horse battery'

describe('record and quote PDFs', () => {
  it('downloads a record and a quote, and leaves out a column the caller cannot view', async () => {
    const harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const viewer = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'bea',
      email: 'bea@example.com',
      password,
    })
    const owner = await new ApiSession(harness.app).prepare()
    expect((await login(owner, 'ada', password)).statusCode).toBe(200)
    const member = await new ApiSession(harness.app).prepare()
    expect((await login(member, 'bea', password)).statusCode).toBe(200)

    const project = await owner.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'Offers', template: 'quotes' },
    })
    const projectId = project.json().project.id as string
    const listed = await owner.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/tables`,
    })
    const quotesId = (listed.json().tables as { id: string; name: string }[]).find(
      (table) => table.name === 'Quotes',
    )?.id
    const detail = await owner.inject({ method: 'GET', url: `/api/v1/tables/${quotesId}` })
    const customerId = (detail.json().table.columns as { id: string; name: string }[]).find(
      (column) => column.name === 'Customer',
    )?.id
    const rows = await owner.inject({ method: 'GET', url: `/api/v1/tables/${quotesId}/rows` })
    const row = rows.json().rows[0] as { id: string; version: number }
    expect(
      (
        await owner.inject({
          method: 'PATCH',
          url: `/api/v1/rows/${row.id}`,
          payload: { version: row.version, cells: { [customerId ?? '']: 'ContosoHidden' } },
        })
      ).statusCode,
    ).toBe(200)

    const record = await owner.inject({ method: 'GET', url: `/api/v1/rows/${row.id}/pdf` })
    expect(pdfText(record)).toContain('ContosoHidden')
    const quote = await owner.inject({ method: 'GET', url: `/api/v1/rows/${row.id}/quote.pdf` })
    const quoteBody = pdfText(quote)
    expect(quoteBody).toContain('ContosoHidden')
    expect(quoteBody).toContain('Workshop')

    expect(
      (
        await owner.inject({
          method: 'POST',
          url: `/api/v1/projects/${projectId}/members`,
          payload: { username: 'bea', preset: 'view' },
        })
      ).statusCode,
    ).toBe(200)
    await harness.db.insert(permissionGrants).values({
      subjectType: 'user',
      subjectId: viewer.id,
      resourceType: 'column',
      resourceId: customerId ?? '',
      action: 'view',
      effect: 'deny',
    })

    const hiddenRecord = await member.inject({ method: 'GET', url: `/api/v1/rows/${row.id}/pdf` })
    expect(pdfText(hiddenRecord)).not.toContain('ContosoHidden')
    const hiddenQuote = await member.inject({
      method: 'GET',
      url: `/api/v1/rows/${row.id}/quote.pdf`,
    })
    const hiddenQuoteBody = pdfText(hiddenQuote)
    expect(hiddenQuoteBody).not.toContain('ContosoHidden')
    expect(hiddenQuoteBody).toContain('Workshop')

    await harness.close()
  })
})

function pdfText(response: {
  statusCode: number
  headers: { [key: string]: unknown }
  rawPayload: Buffer
}) {
  expect(response.statusCode).toBe(200)
  expect(String(response.headers['content-type'])).toContain('application/pdf')
  const raw = response.rawPayload.toString('latin1')
  expect(raw.startsWith('%PDF-')).toBe(true)
  // pdfkit writes text as hex inside TJ arrays, with kerning numbers between pieces of a word.
  return raw.replace(/\[([\s\S]*?)\]\s*TJ/g, (_, inner: string) =>
    [...inner.matchAll(/<([0-9a-fA-F]+)>/g)]
      .map((match) => Buffer.from(match[1] ?? '', 'hex').toString('latin1'))
      .join(''),
  )
}
