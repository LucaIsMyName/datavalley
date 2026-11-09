import { afterEach, describe, expect, it } from 'vitest'
import { dataConnectors } from '../../database/schema.js'
import { ApiSession, createHarness, createUser, login, type Harness } from '../../test/harness.js'
import { executeConnectorSyncJob } from '../connectors/sync.js'

const password = 'correct horse battery'

describe('my work and assignment notices', () => {
  let harness: Harness

  afterEach(async () => {
    await harness?.close()
  })

  it('moves a due task to the assignee and keeps future, done, and undated tasks off the list', async () => {
    harness = await createHarness()
    const ada = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const bea = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'bea',
      email: 'bea@example.com',
      password,
      role: 'user',
    })
    const adaSession = await new ApiSession(harness.app).prepare()
    expect((await login(adaSession, 'ada', password)).statusCode).toBe(200)
    const created = await adaSession.inject({
      method: 'POST',
      url: '/api/v1/projects',
      payload: { name: 'Pipeline', template: 'crm' },
    })
    const projectId = created.json().project.id as string
    const member = await adaSession.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/members`,
      payload: { username: 'bea' },
    })
    expect(member.statusCode).toBe(200)
    const listed = await adaSession.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/tables` })
    const tasksId = (listed.json().tables as { id: string; name: string }[]).find((table) => table.name === 'Tasks')?.id
    const detail = await adaSession.inject({ method: 'GET', url: `/api/v1/tables/${tasksId}` })
    const columns = detail.json().table.columns as { id: string; name: string }[]
    const nameId = columns.find((column) => column.name === 'Name')?.id
    const assigneeId = columns.find((column) => column.name === 'Assignee')?.id
    const rows = await adaSession.inject({ method: 'GET', url: `/api/v1/tables/${tasksId}/rows` })
    const follow = (rows.json().rows as { id: string; version: number; cells: Record<string, unknown> }[]).find(
      (row) => row.cells[nameId ?? ''] === 'Follow up',
    )
    expect(follow).toBeTruthy()
    const quiet = await adaSession.inject({ method: 'GET', url: '/api/v1/notifications' })
    expect(quiet.json().notifications).toEqual([])
    const patched = await adaSession.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${follow?.id}`,
      payload: { version: follow?.version, cells: { [assigneeId ?? '']: [bea.id] } },
    })
    expect(patched.statusCode).toBe(200)
    const stillQuiet = await adaSession.inject({ method: 'GET', url: '/api/v1/notifications' })
    expect((stillQuiet.json().notifications as { title: string }[]).map((item) => item.title)).not.toContain(
      'Assigned: Follow up',
    )
    const adaWork = await adaSession.inject({ method: 'GET', url: '/api/v1/work' })
    expect((adaWork.json().tasks as { title: string }[]).map((task) => task.title)).not.toContain('Follow up')

    const beaSession = await new ApiSession(harness.app).prepare()
    expect((await login(beaSession, 'bea', password)).statusCode).toBe(200)
    const noticed = await beaSession.inject({ method: 'GET', url: '/api/v1/notifications' })
    const assignment = (noticed.json().notifications as { title: string; href: string | null; body: string }[])[0]
    expect(assignment?.title).toBe('Assigned: Follow up')
    expect(assignment?.body).toBe('Tasks')
    expect(assignment?.href).toBe(`/projects/${projectId}/tables/${tasksId}/rows/${follow?.id}`)
    const beaWork = await beaSession.inject({ method: 'GET', url: '/api/v1/work' })
    expect((beaWork.json().tasks as { title: string; overdue: boolean }[]).map((task) => task.title)).toEqual([
      'Follow up',
    ])
    const doneId = columns.find((column) => column.name === 'Done')?.id
    const finished = await adaSession.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${follow?.id}`,
      payload: { version: patched.json().row.version, cells: { [doneId ?? '']: true } },
    })
    expect(finished.statusCode).toBe(200)
    const cleared = await beaSession.inject({ method: 'GET', url: '/api/v1/work' })
    expect(cleared.json().tasks).toEqual([])
    expect(ada.id).not.toBe(bea.id)
  })

  it('notifies the connector owner when a sync fails', async () => {
    harness = await createHarness()
    const ada = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    const session = await new ApiSession(harness.app).prepare()
    expect((await login(session, 'ada', password)).statusCode).toBe(200)
    const [connector] = await harness.db
      .insert(dataConnectors)
      .values({
        organizationId: harness.organizationId,
        name: 'Broken feed',
        format: 'json',
        createdBy: ada.id,
      })
      .returning()
    await expect(
      executeConnectorSyncJob(harness.db, harness.env, { connectorId: connector.id, actorUserId: ada.id }),
    ).rejects.toThrow(/linked tables/)
    const noticed = await session.inject({ method: 'GET', url: '/api/v1/notifications' })
    const notice = (noticed.json().notifications as { title: string; href: string | null; type: string }[])[0]
    expect(notice?.type).toBe('connector.sync_failed')
    expect(notice?.title).toBe('Sync failed: Broken feed')
    expect(notice?.href).toBe('/integrations')
  })
})
