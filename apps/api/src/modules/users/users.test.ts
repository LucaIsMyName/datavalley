import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { permissionGrants, users } from '../../database/schema.js'
import { ApiSession, createHarness, createUser, login, type Harness } from '../../test/harness.js'

const password = 'correct horse battery'

describe('admin user management', () => {
  let harness: Harness
  let admin: ApiSession
  let member: ApiSession
  let adaId: string

  beforeAll(async () => {
    harness = await createHarness()
    const ada = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    adaId = ada.id
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'bob',
      email: 'bob@example.com',
      password,
      role: 'user',
    })
    admin = await new ApiSession(harness.app).prepare()
    member = await new ApiSession(harness.app).prepare()
    expect((await login(admin, 'ada', password)).statusCode).toBe(200)
    expect((await login(member, 'bob', password)).statusCode).toBe(200)
  })

  afterAll(async () => {
    await harness?.close()
  })

  it('lets an admin edit another admin including username, email, and role', async () => {
    const created = await admin.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { username: 'cam', email: 'cam@example.com', password, role: 'admin' },
    })
    expect(created.statusCode).toBe(200)
    const camId = created.json().user.id as string

    const updated = await admin.inject({
      method: 'PATCH',
      url: `/api/v1/users/${camId}`,
      payload: { username: 'cameron', email: 'cameron@example.com', role: 'user' },
    })
    expect(updated.statusCode).toBe(200)
    expect(updated.json().user).toMatchObject({
      username: 'cameron',
      email: 'cameron@example.com',
      role: 'user',
    })
  })

  it('rejects duplicate username and email with conflict', async () => {
    const created = await admin.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { username: 'duped', email: 'duped@example.com', password, role: 'user' },
    })
    expect(created.statusCode).toBe(200)
    const id = created.json().user.id as string

    const usernameClash = await admin.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { username: 'ada', email: 'fresh-ada@example.com', password, role: 'user' },
    })
    expect(usernameClash.statusCode).toBe(409)
    expect(usernameClash.json().error.code).toBe('conflict')

    const emailClash = await admin.inject({
      method: 'PATCH',
      url: `/api/v1/users/${id}`,
      payload: { email: 'ada@example.com' },
    })
    expect(emailClash.statusCode).toBe(409)
    expect(emailClash.json().error.code).toBe('conflict')
  })

  it('blocks non-admins from listing, creating, editing, or deleting other users', async () => {
    expect((await member.inject({ method: 'GET', url: '/api/v1/users' })).statusCode).toBe(403)
    expect(
      (
        await member.inject({
          method: 'POST',
          url: '/api/v1/users',
          payload: { username: 'eve', email: 'eve@example.com', password, role: 'user' },
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (await member.inject({ method: 'PATCH', url: `/api/v1/users/${adaId}`, payload: { username: 'hacked' } }))
        .statusCode,
    ).toBe(404)
    expect((await member.inject({ method: 'DELETE', url: `/api/v1/users/${adaId}` })).statusCode).toBe(404)
    expect((await member.inject({ method: 'POST', url: `/api/v1/users/${adaId}/disable` })).statusCode).toBe(404)
  })

  it('lets an admin delete another admin and cleans up grants', async () => {
    const created = await admin.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { username: 'dana', email: 'dana@example.com', password, role: 'admin' },
    })
    expect(created.statusCode).toBe(200)
    const danaId = created.json().user.id as string
    const grants = await admin.inject({
      method: 'PUT',
      url: `/api/v1/users/${danaId}/permissions`,
      payload: { grants: [{ action: 'view', effect: 'allow' }] },
    })
    expect(grants.statusCode).toBe(200)
    expect((await admin.inject({ method: 'DELETE', url: `/api/v1/users/${danaId}` })).statusCode).toBe(200)
    const leftover = await harness.db
      .select()
      .from(permissionGrants)
      .where(and(eq(permissionGrants.subjectType, 'user'), eq(permissionGrants.subjectId, danaId)))
    expect(leftover).toEqual([])
    const rows = await harness.db.select().from(users).where(eq(users.id, danaId))
    expect(rows).toEqual([])
  })

  it('rejects deleting your own account', async () => {
    const response = await admin.inject({ method: 'DELETE', url: `/api/v1/users/${adaId}` })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.message).toMatch(/own account/i)
  })

  it('rejects disabling or demoting the last administrator', async () => {
    const disable = await admin.inject({ method: 'POST', url: `/api/v1/users/${adaId}/disable` })
    expect(disable.statusCode).toBe(400)
    expect(disable.json().error.message).toMatch(/administrator/i)
    const demote = await admin.inject({
      method: 'PATCH',
      url: `/api/v1/users/${adaId}`,
      payload: { role: 'user' },
    })
    expect(demote.statusCode).toBe(400)
    expect(demote.json().error.message).toMatch(/administrator/i)
  })

  it('lets an admin disable, enable, and reset another user password', async () => {
    const created = await admin.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { username: 'finn', email: 'finn@example.com', password, role: 'user' },
    })
    expect(created.statusCode).toBe(200)
    const finnId = created.json().user.id as string

    const disabled = await admin.inject({ method: 'POST', url: `/api/v1/users/${finnId}/disable` })
    expect(disabled.statusCode).toBe(200)
    expect(disabled.json().user.disabled).toBe(true)

    const enabled = await admin.inject({ method: 'POST', url: `/api/v1/users/${finnId}/enable` })
    expect(enabled.statusCode).toBe(200)
    expect(enabled.json().user.disabled).toBe(false)

    const nextPassword = 'a much better password'
    const reset = await admin.inject({
      method: 'POST',
      url: `/api/v1/users/${finnId}/reset-password`,
      payload: { password: nextPassword },
    })
    expect(reset.statusCode).toBe(200)
    const session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'finn', password)).statusCode).toBe(401)
    expect((await login(session, 'finn', nextPassword)).statusCode).toBe(200)
  })
})
