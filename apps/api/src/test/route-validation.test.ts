import { describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login } from './harness.js'

const password = 'correct horse battery'

describe('route validation', () => {
  it('rejects invalid project and user payloads', async () => {
    const harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'admin',
      email: 'admin@example.com',
      password,
      role: 'admin',
    })
    const session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'admin', password)).statusCode).toBe(200)

    const project = await session.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'Validated' },
    })
    expect(project.statusCode).toBe(200)
    const projectId = project.json().project.id as string

    const badPatch = await session.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${projectId}`,
      payload: { settings: 'not-an-object' },
    })
    expect(badPatch.statusCode).toBe(400)
    expect(badPatch.json().error.code).toBe('validation_error')

    const member = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'grantee',
      email: 'grantee@example.com',
      password,
    })

    const badPermissions = await session.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/permissions`,
      payload: { userId: member.id, grants: [{ action: 'not_an_action', effect: 'allow' }] },
    })
    expect(badPermissions.statusCode).toBe(400)

    const badUserPatch = await session.inject({
      method: 'PATCH',
      url: `/api/v1/users/${member.id}`,
      payload: { theme: 'neon' },
    })
    expect(badUserPatch.statusCode).toBe(400)

    await harness.close()
  })
})
