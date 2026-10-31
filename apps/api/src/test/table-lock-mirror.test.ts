import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login, type Harness } from './harness.js'

const password = 'correct horse battery'

describe('table lock and mirrors', () => {
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

  it('locks a table and blocks row edits until unlocked', async () => {
    const project = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Lock' } })
    const projectId = project.json().project.id as string
    const table = await session.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Data' } })
    const tableId = table.json().table.id as string
    const column = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Title', type: 'text' },
    })
    const columnId = column.json().column.id as string
    const row = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { cells: { [columnId]: 'Before' } },
    })
    const rowId = row.json().row.id as string

    const locked = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/lock` })
    expect(locked.statusCode).toBe(200)
    expect(locked.json().table.lockedAt).toBeTruthy()

    const blocked = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${rowId}`,
      payload: { version: 1, cells: { [columnId]: 'After' } },
    })
    expect(blocked.statusCode).toBe(409)

    const unlocked = await session.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/unlock` })
    expect(unlocked.statusCode).toBe(200)
    expect(unlocked.json().table.lockedAt).toBeNull()

    const patched = await session.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${rowId}`,
      payload: { version: 1, cells: { [columnId]: 'After' } },
    })
    expect(patched.statusCode).toBe(200)
  })

  it('creates a mirror that reads source rows and rejects writes on the shell', async () => {
    const sourceProject = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Source' } })
    const sourceProjectId = sourceProject.json().project.id as string
    const sourceTable = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${sourceProjectId}/tables`,
      payload: { name: 'Inventory' },
    })
    const sourceTableId = sourceTable.json().table.id as string
    const column = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${sourceTableId}/columns`,
      payload: { name: 'SKU', type: 'text' },
    })
    const columnId = column.json().column.id as string
    await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${sourceTableId}/rows`,
      payload: { cells: { [columnId]: 'ABC-1' } },
    })

    const hostProject = await session.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Host' } })
    const hostProjectId = hostProject.json().project.id as string
    const mirror = await session.inject({
      method: 'POST',
      url: `/api/v1/projects/${hostProjectId}/tables/mirror`,
      payload: { sourceTableId: sourceTableId, name: 'Inventory view' },
    })
    expect(mirror.statusCode).toBe(200)
    const mirrorId = mirror.json().table.id as string
    expect(mirror.json().table.mirrorOfTableId).toBe(sourceTableId)

    const detail = await session.inject({ method: 'GET', url: `/api/v1/tables/${mirrorId}` })
    expect(detail.statusCode).toBe(200)
    expect(detail.json().table.mirrorSource?.tableId).toBe(sourceTableId)
    const mirrorColumnId = (detail.json().table.columns as { id: string; name: string }[]).find(
      (item) => item.name === 'SKU',
    )!.id

    const rows = await session.inject({ method: 'GET', url: `/api/v1/tables/${mirrorId}/rows` })
    expect(rows.statusCode).toBe(200)
    expect(rows.json().rows[0].cells[mirrorColumnId]).toBe('ABC-1')

    const write = await session.inject({
      method: 'POST',
      url: `/api/v1/tables/${mirrorId}/rows`,
      payload: { cells: { [mirrorColumnId]: 'Nope' } },
    })
    expect(write.statusCode).toBe(409)
  })
})
