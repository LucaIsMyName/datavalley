import { describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login } from './harness.js'

describe('connectors', () => {
  it('requires admin for org-wide connector create', async () => {
    const harness = await createHarness()
    const admin = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'connadmin',
      email: 'connadmin@example.com',
      password: 'Password123!',
      role: 'admin',
    })
    const user = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'connuser',
      email: 'connuser@example.com',
      password: 'Password123!',
    })
    const adminSession = new ApiSession(harness.app)
    await adminSession.prepare()
    await login(adminSession, admin.username, 'Password123!')
    const userSession = new ApiSession(harness.app)
    await userSession.prepare()
    await login(userSession, user.username, 'Password123!')

    const denied = await userSession.inject({
      method: 'POST',
      url: '/api/v1/connectors',
      payload: {
        name: 'Feed',
        source: { baseUrl: 'https://example.com/data.json' },
        format: 'json',
        parse: { version: 1, fields: [{ sourceKey: 'id', targetFieldKey: 'id' }] },
      },
    })
    expect(denied.statusCode).toBe(403)

    const created = await adminSession.inject({
      method: 'POST',
      url: '/api/v1/connectors',
      payload: {
        name: 'Feed',
        source: { baseUrl: 'https://example.com/data.json' },
        format: 'json',
        parse: { version: 1, fields: [{ sourceKey: 'id', targetFieldKey: 'id' }] },
        retention: { mode: 'forever' },
      },
    })
    expect(created.statusCode).toBe(200)
    const body = created.json() as { connector: { id: string; name: string } }
    expect(body.connector.name).toBe('Feed')

    const list = await adminSession.inject({ method: 'GET', url: '/api/v1/connectors' })
    expect(list.json().connectors).toHaveLength(1)

    await harness.close()
  })

  it('rejects drop_missing retention without external id', async () => {
    const harness = await createHarness()
    const admin = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'retadmin',
      email: 'retadmin@example.com',
      password: 'Password123!',
      role: 'admin',
    })
    const session = new ApiSession(harness.app)
    await session.prepare()
    await login(session, admin.username, 'Password123!')
    const response = await session.inject({
      method: 'POST',
      url: '/api/v1/connectors',
      payload: {
        name: 'Bad retention',
        source: { baseUrl: 'https://example.com/data.json' },
        format: 'json',
        parse: { version: 1, fields: [{ sourceKey: 'name', targetFieldKey: 'name' }] },
        retention: { mode: 'drop_missing', missingAfterDays: 7 },
      },
    })
    expect(response.statusCode).toBe(400)
    await harness.close()
  })
})
