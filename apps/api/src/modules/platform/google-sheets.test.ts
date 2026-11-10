import { describe, expect, it } from 'vitest'
import { pluginConnections } from '../../database/schema.js'
import { ApiSession, createHarness, createUser, login } from '../../test/harness.js'
import { signState } from './service.js'

const password = 'correct horse battery'

describe('google sheets availability', () => {
  it('hides the plugin and only accepts a callback from the user who started it', async () => {
    const harness = await createHarness()
    const ada = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'bea',
      email: 'bea@example.com',
      password,
      role: 'admin',
    })
    const owner = await new ApiSession(harness.app).prepare()
    expect((await login(owner, 'ada', password)).statusCode).toBe(200)
    const other = await new ApiSession(harness.app).prepare()
    expect((await login(other, 'bea', password)).statusCode).toBe(200)

    const project = await owner.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Sheets' } })
    const projectId = project.json().project.id as string
    const plugins = await owner.inject({ method: 'GET', url: '/api/v1/plugins' })
    expect(plugins.json().plugins.map((plugin: { id: string }) => plugin.id)).not.toContain('google-sheets')
    expect(
      (await owner.inject({ method: 'GET', url: `/api/v1/integrations/google-sheets/connect?projectId=${projectId}` }))
        .statusCode,
    ).toBe(501)

    const state = signState(harness.env, { projectId, userId: ada.id })
    const callback = `/api/v1/integrations/google-sheets/callback?state=${encodeURIComponent(state)}&code=abc`
    expect((await harness.app.inject({ method: 'GET', url: callback })).statusCode).toBe(401)
    expect((await other.inject({ method: 'GET', url: callback })).statusCode).toBe(401)
    expect((await owner.inject({ method: 'GET', url: callback })).statusCode).toBe(501)
    expect(await harness.db.select().from(pluginConnections)).toHaveLength(0)

    await harness.close()
  })
})
