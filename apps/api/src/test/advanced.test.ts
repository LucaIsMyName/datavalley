import { eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { auditLogs, users } from '../database/schema.js'
import { encryptString } from '../security/crypto.js'
import { createHmac } from 'node:crypto'
import { createJob, runJob } from '../jobs/process.js'
import { pluginConnections } from '../database/schema.js'
import { ApiSession, createHarness, createUser, login, type Harness } from './harness.js'

const password = 'correct horse battery'

async function sessionFor(harness: Harness, username: string) {
  const session = await new ApiSession(harness.app).prepare()
  const response = await login(session, username, password)
  expect(response.statusCode).toBe(200)
  return session
}

describe('advanced crm behavior', () => {
  let harness: Harness

  afterAll(async () => {
    await harness?.close()
  })

  it('locks accounts, forces the initial password change, and keeps audit rows append-only', async () => {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const locked = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'locked',
      email: 'locked@example.com',
      password,
    })
    const gate = await new ApiSession(harness.app).prepare()
    for (let attempt = 0; attempt < 10; attempt++) await login(gate, 'locked', 'not-the-password')
    const blocked = await login(gate, 'locked', password)
    expect(blocked.statusCode).toBe(429)
    const disabled = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'disabled',
      email: 'disabled@example.com',
      password,
    })
    await harness.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, disabled.id))
    const disabledLogin = await login(await new ApiSession(harness.app).prepare(), 'disabled', password)
    expect(disabledLogin.statusCode).toBe(401)
    void locked

    const newbie = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'nina',
      email: 'nina@example.com',
      password,
      mustChangePassword: true,
    })
    void newbie
    const nina = await sessionFor(harness, 'nina')
    expect((await nina.inject({ method: 'GET', url: '/api/v1/projects' })).statusCode).toBe(403)
    const changed = await nina.inject({
      method: 'POST',
      url: '/api/v1/auth/change-password',
      payload: { currentPassword: password, newPassword: 'a much better password' },
    })
    expect(changed.statusCode).toBe(200)
    expect((await nina.inject({ method: 'GET', url: '/api/v1/projects' })).statusCode).toBe(200)

    const admin = await sessionFor(harness, 'ada')
    const created = await admin.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { username: 'cam', email: 'cam@example.com', password, role: 'user' },
    })
    expect(created.statusCode).toBe(200)
    const audits = await harness.db.select().from(auditLogs).where(eq(auditLogs.action, 'user.create'))
    expect(audits.length).toBeGreaterThan(0)
    let auditError = ''
    try {
      await harness.db.update(auditLogs).set({ action: 'tamper' }).where(eq(auditLogs.id, audits[0].id))
    } catch (error) {
      let current: unknown = error
      while (current) {
        auditError += current instanceof Error ? current.message : String(current)
        current = current instanceof Error ? (current as Error & { cause?: unknown }).cause : undefined
      }
    }
    expect(auditError).toMatch(/append-only/)
    const timeout = await harness.db.execute(sql`show statement_timeout`)
    expect(JSON.stringify(timeout)).toMatch(/5s|5000/)
  })

  it('imports, exports, formats views, and enforces relations', async () => {
    const admin = await sessionFor(harness, 'ada')
    const project = await admin.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Books' } })
    const projectId = project.json().project.id as string
    const table = await admin.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Orders' } })
    const tableId = table.json().table.id as string
    const amount = await admin.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Amount', type: 'number' },
    })
    const columnId = amount.json().column.id as string
    const boundary = '----datavalley'
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="rows.csv"\r\nContent-Type: text/csv\r\n\r\nAmount\nabc\r\n10\r\n--${boundary}--\r\n`
    const imported = await admin.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/import`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })
    expect(imported.statusCode).toBe(200)
    expect(imported.json().errors.length).toBeGreaterThan(0)

    await admin.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [columnId]: 10 } } })
    await admin.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: { [columnId]: 30 } } })
    const footer = await admin.inject({
      method: 'GET',
      url: `/api/v1/tables/${tableId}/footer?filter=${encodeURIComponent(JSON.stringify({ op: 'gt', columnId, value: 15 }))}`,
    })
    expect(footer.json().footer[columnId].sum).toBe(30)

    const view = await admin.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/views`,
      payload: { name: 'Mine', shared: false, definition: { hiddenColumnIds: [], formatting: [] } },
    })
    expect(view.statusCode).toBe(200)
    const cam = await sessionFor(harness, 'cam')
    expect(
      (await cam.inject({
        method: 'POST',
        url: '/api/v1/auth/change-password',
        payload: { currentPassword: password, newPassword: 'cam has a longer password' },
      })).statusCode,
    ).toBe(200)
    await admin.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/members`, payload: { username: 'cam' } })
    const views = await cam.inject({ method: 'GET', url: `/api/v1/tables/${tableId}/views` })
    expect(views.statusCode, JSON.stringify(views.json())).toBe(200)
    expect(views.json().views).toEqual([])

    const customers = await admin.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Customers' } })
    const relation = await admin.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/relations`,
      payload: { toTableId: customers.json().table.id, cardinality: 'one_to_one', name: 'Customer' },
    })
    expect(relation.statusCode).toBe(200)
    const customerRow = await admin.inject({ method: 'POST', url: `/api/v1/tables/${customers.json().table.id}/rows`, payload: {} })
    const left = await admin.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: {} })
    const right = await admin.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: {} })
    const relationId = relation.json().relation.id as string
    const firstLink = await admin.inject({
      method: 'POST',
      url: `/api/v1/relations/${relationId}/records`,
      payload: { fromRowId: left.json().row.id, toRowId: customerRow.json().row.id },
    })
    expect(firstLink.statusCode).toBe(200)
    const secondLink = await admin.inject({
      method: 'POST',
      url: `/api/v1/relations/${relationId}/records`,
      payload: { fromRowId: right.json().row.id, toRowId: customerRow.json().row.id },
    })
    expect(secondLink.statusCode).toBe(409)
    const removed = await admin.inject({ method: 'DELETE', url: `/api/v1/rows/${customerRow.json().row.id}` })
    expect(removed.statusCode).toBe(409)

    await admin.inject({ method: 'POST', url: '/api/v1/plugins/csv/disable' })
    const blockedImport = await admin.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/import`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    })
    expect(blockedImport.statusCode).toBe(403)
    await admin.inject({ method: 'POST', url: '/api/v1/plugins/csv/enable' })

    const secret = 'hook-secret'
    const [connection] = await harness.db
      .insert(pluginConnections)
      .values({
        pluginId: 'google-sheets',
        projectId,
        name: 'Hook',
        credentialsEncrypted: encryptString(harness.env.CREDENTIALS_KEY, secret),
        config: {},
      })
      .returning()
    const payload = JSON.stringify({ hello: true })
    const signature = createHmac('sha256', secret).update(payload).digest('hex')
    const badHook = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/integrations/${connection.id}/webhook`,
      headers: { 'content-type': 'application/json', 'x-datavalley-signature': 'nope' },
      payload,
    })
    expect(badHook.statusCode).toBe(401)
    const goodHook = await harness.app.inject({
      method: 'POST',
      url: `/api/v1/integrations/${connection.id}/webhook`,
      headers: { 'content-type': 'application/json', 'x-datavalley-signature': signature },
      payload,
    })
    expect(goodHook.statusCode).toBe(200)
    const connections = await admin.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/connections` })
    expect(JSON.stringify(connections.json())).not.toContain(secret)

    const job = await createJob(harness.db, 'retry-demo', {})
    await expect(
      runJob(harness.db, job.id, async (_payload, attempts) => {
        if (attempts < 2) throw new Error('try again')
        return { ok: true }
      }),
    ).rejects.toThrow(/try again/)
    const done = await runJob(harness.db, job.id, async (_payload, attempts) => {
      if (attempts < 2) throw new Error('try again')
      return { ok: true }
    })
    expect(done.status).toBe('completed')
  })
})
