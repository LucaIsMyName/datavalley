import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiKeys, permissionGrants, serviceAccounts } from '../../database/schema.js'
import { ApiSession, createHarness, createUser, login, type Harness } from '../../test/harness.js'

const password = 'correct horse battery'

describe('api key revoke and delete', () => {
  let harness: Harness
  let admin: ApiSession
  let member: ApiSession

  beforeAll(async () => {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
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

  async function createScopedKey(name: string) {
    const project = await admin.inject({ method: 'POST', url: '/api/v1/projects', payload: { name } })
    expect(project.statusCode).toBe(200)
    const projectId = project.json().project.id as string
    const created = await admin.inject({
      method: 'POST',
      url: '/api/v1/api-keys',
      payload: {
        name,
        scopes: [{ action: 'view', resourceType: 'project', resourceId: projectId }],
      },
    })
    expect(created.statusCode).toBe(200)
    return {
      projectId,
      id: created.json().apiKey.id as string,
      secret: created.json().apiKey.key as string,
      serviceAccountId: (await harness.db.select().from(apiKeys).where(eq(apiKeys.id, created.json().apiKey.id)))[0]
        ?.serviceAccountId as string,
    }
  }

  it('revokes a key without deleting it and rejects the secret', async () => {
    const key = await createScopedKey('revoke-me')
    const revoked = await admin.inject({ method: 'POST', url: `/api/v1/api-keys/${key.id}/revoke` })
    expect(revoked.statusCode).toBe(200)
    const listed = await admin.inject({ method: 'GET', url: '/api/v1/api-keys' })
    const row = (listed.json().apiKeys as { id: string; revokedAt: string | null }[]).find((item) => item.id === key.id)
    expect(row?.revokedAt).toBeTruthy()
    const stored = await harness.db.select().from(apiKeys).where(eq(apiKeys.id, key.id))
    expect(stored).toHaveLength(1)
    const denied = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${key.projectId}`,
      headers: { authorization: `Bearer ${key.secret}` },
    })
    expect(denied.statusCode).toBe(401)
  })

  it('deletes a key, its service account, and grants', async () => {
    const key = await createScopedKey('delete-me')
    const grantsBefore = await harness.db
      .select()
      .from(permissionGrants)
      .where(and(eq(permissionGrants.subjectType, 'api_key'), eq(permissionGrants.subjectId, key.id)))
    expect(grantsBefore.length).toBeGreaterThan(0)
    expect((await admin.inject({ method: 'DELETE', url: `/api/v1/api-keys/${key.id}` })).statusCode).toBe(200)
    expect(await harness.db.select().from(apiKeys).where(eq(apiKeys.id, key.id))).toEqual([])
    expect(await harness.db.select().from(serviceAccounts).where(eq(serviceAccounts.id, key.serviceAccountId))).toEqual(
      [],
    )
    expect(
      await harness.db
        .select()
        .from(permissionGrants)
        .where(and(eq(permissionGrants.subjectType, 'api_key'), eq(permissionGrants.subjectId, key.id))),
    ).toEqual([])
    const denied = await harness.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${key.projectId}`,
      headers: { authorization: `Bearer ${key.secret}` },
    })
    expect(denied.statusCode).toBe(401)
  })

  it('can delete a revoked key', async () => {
    const key = await createScopedKey('revoke-then-delete')
    expect((await admin.inject({ method: 'POST', url: `/api/v1/api-keys/${key.id}/revoke` })).statusCode).toBe(200)
    expect((await admin.inject({ method: 'DELETE', url: `/api/v1/api-keys/${key.id}` })).statusCode).toBe(200)
    expect(await harness.db.select().from(apiKeys).where(eq(apiKeys.id, key.id))).toEqual([])
  })

  it('forbids non-admins from managing keys', async () => {
    expect((await member.inject({ method: 'GET', url: '/api/v1/api-keys' })).statusCode).toBe(403)
    expect(
      (await member.inject({ method: 'POST', url: '/api/v1/api-keys', payload: { name: 'nope', scopes: [] } }))
        .statusCode,
    ).toBe(403)
    const key = await createScopedKey('admin-only')
    expect((await member.inject({ method: 'POST', url: `/api/v1/api-keys/${key.id}/revoke` })).statusCode).toBe(403)
    expect((await member.inject({ method: 'DELETE', url: `/api/v1/api-keys/${key.id}` })).statusCode).toBe(403)
  })
})
