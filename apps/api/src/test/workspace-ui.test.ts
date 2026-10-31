import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login, type Harness } from './harness.js'

const password = 'correct horse battery'

describe('workspace library', () => {
  let harness: Harness
  let session: ApiSession

  beforeAll(async () => {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    session = await new ApiSession(harness.app).prepare()
    const signedIn = await login(session, 'ada', password)
    expect(signedIn.statusCode).toBe(200)
  })

  afterAll(async () => {
    await harness?.close()
  })

  it('saves a project icon and rejects an unknown one', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Icons' } })
    const projectId = project.json().project.id as string
    expect(project.json().project.icon).toBe('FolderKanban')
    const saved = await session.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${projectId}`,
      payload: { icon: 'Star' },
    })
    expect(saved.statusCode).toBe(200)
    expect(saved.json().project.icon).toBe('Star')
    const rejected = await session.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${projectId}`,
      payload: { icon: 'NotAnIcon' },
    })
    expect(rejected.statusCode).toBe(400)
  })

  it('saves a table icon and lists recent and favorite names', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Library' } })
    const projectId = project.json().project.id as string
    const table = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Invoices' } })
    const tableId = table.json().table.id as string
    expect(table.json().table.icon).toBe('Table')
    const icon = await session.inject({
      method: 'PATCH',
      url: `/api/v1/tables/${tableId}`,
      payload: { icon: 'Wallet' },
    })
    expect(icon.statusCode).toBe(200)
    expect(icon.json().table.icon).toBe('Wallet')

    const opened = await session.inject({ method: 'GET', url: `/api/v1/tables/${tableId}` })
    expect(opened.statusCode).toBe(200)
    const recents = await session.inject({ method: 'GET', url: '/api/v1/recents' })
    expect(recents.json().recents).toContainEqual(
      expect.objectContaining({
        resourceType: 'table',
        resourceId: tableId,
        title: 'Invoices',
        icon: 'Wallet',
        href: `/projects/${projectId}/tables/${tableId}`,
      }),
    )

    const favorite = await session.inject({
      method: 'POST',
      url: '/api/v1/favorites',
      payload: { resourceType: 'project', resourceId: projectId },
    })
    expect(favorite.statusCode).toBe(200)
    const favorites = await session.inject({ method: 'GET', url: '/api/v1/favorites' })
    expect(favorites.json().favorites).toContainEqual(
      expect.objectContaining({
        resourceType: 'project',
        resourceId: projectId,
        title: 'Library',
        icon: 'FolderKanban',
        href: `/projects/${projectId}`,
      }),
    )
  })
})
