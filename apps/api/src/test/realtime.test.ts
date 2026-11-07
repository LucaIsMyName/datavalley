import { afterAll, describe, expect, it } from 'vitest'
import type { RealtimeEvent } from '@datavalley/shared'
import { permissionGrants } from '../database/schema.js'
import { ApiSession, createHarness, createUser, login, type Harness } from './harness.js'

const password = 'correct horse battery'

async function readEvents(response: Response, until: (events: RealtimeEvent[]) => boolean) {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('missing body')
  const decoder = new TextDecoder()
  let buffer = ''
  const events: RealtimeEvent[] = []
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    const next = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value?: undefined }>((resolve) => {
        setTimeout(() => resolve({ done: true }), Math.max(1, deadline - Date.now()))
      }),
    ])
    if (next.done) break
    buffer += decoder.decode(next.value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      const data = chunk
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('\n')
      if (!data || data.startsWith(':')) continue
      events.push(JSON.parse(data) as RealtimeEvent)
    }
    if (until(events)) return events
  }
  throw new Error(`timed out with ${JSON.stringify(events)}`)
}

describe('live project events', () => {
  let harness: Harness

  afterAll(async () => {
    await harness?.close()
  })

  it('merges cell writes, streams them, and hides a forbidden column', async () => {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'admin',
      email: 'admin@example.com',
      password,
      role: 'admin',
    })
    const member = await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'bea',
      email: 'bea@example.com',
      password,
    })
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'outsider',
      email: 'out@example.com',
      password,
    })
    const owner = await new ApiSession(harness.app).prepare()
    const viewer = await new ApiSession(harness.app).prepare()
    const stranger = await new ApiSession(harness.app).prepare()
    expect((await login(owner, 'admin', password)).statusCode).toBe(200)
    expect((await login(viewer, 'bea', password)).statusCode).toBe(200)
    expect((await login(stranger, 'outsider', password)).statusCode).toBe(200)

    const project = await owner.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Live' } })
    const projectId = project.json().project.id as string
    const table = await owner.inject({ method: 'POST', url: `/api/v1/projects/${projectId}/tables`, payload: { name: 'Roster' } })
    if (table.statusCode !== 200) throw new Error(`${table.statusCode} ${table.body}`)
    const tableId = table.json().table.id as string
    const name = await owner.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Name', type: 'text' } })
    const secret = await owner.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/columns`, payload: { name: 'Secret', type: 'text' } })
    const nameId = name.json().column.id as string
    const secretId = secret.json().column.id as string
    const created = await owner.inject({ method: 'POST', url: `/api/v1/tables/${tableId}/rows`, payload: { cells: {} } })
    const rowId = created.json().row.id as string
    const version = created.json().row.version as number

    const first = await owner.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${rowId}`,
      payload: { version, cells: { [nameId]: 'Ada' } },
    })
    expect(first.statusCode).toBe(200)
    const second = await owner.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${rowId}`,
      payload: { version: first.json().row.version, cells: { [secretId]: 'hidden' } },
    })
    expect(second.statusCode).toBe(200)
    expect(second.json().row.cells[nameId]).toBe('Ada')
    expect(second.json().row.cells[secretId]).toBe('hidden')
    const third = await owner.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${rowId}`,
      payload: { version: second.json().row.version, cells: { [secretId]: 'later' } },
    })
    expect(third.statusCode).toBe(200)
    expect(third.json().row.cells[nameId]).toBe('Ada')
    expect(third.json().row.cells[secretId]).toBe('later')

    await owner.inject({
      method: 'PUT',
      url: `/api/v1/projects/${projectId}/permissions`,
      payload: { userId: member.id, grants: [{ action: 'view', effect: 'allow' }] },
    })
    await harness.db.insert(permissionGrants).values({
      subjectType: 'user',
      subjectId: member.id,
      resourceType: 'column',
      resourceId: secretId,
      action: 'view',
      effect: 'deny',
    })

    const denied = await stranger.inject({ method: 'GET', url: `/api/v1/projects/${projectId}/events` })
    expect(denied.statusCode).toBe(404)

    await harness.app.listen({ port: 0, host: '127.0.0.1' })
    const address = harness.app.server.address()
    const port = typeof address === 'object' && address ? address.port : 0
    const cookie = [...viewer.cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ')
    const controller = new AbortController()
    const stream = await fetch(`http://127.0.0.1:${port}/api/v1/projects/${projectId}/events`, {
      headers: { cookie },
      signal: controller.signal,
    })
    expect(stream.status).toBe(200)
    expect(stream.headers.get('content-type')).toContain('text/event-stream')
    const pending = readEvents(stream, (events) => events.some((event) => event.type === 'row.updated' && event.actorId !== member.id))
    const patched = await owner.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${rowId}`,
      payload: { version: third.json().row.version, cells: { [nameId]: 'Grace', [secretId]: 'still-secret' } },
    })
    expect(patched.statusCode).toBe(200)
    const events = await pending
    controller.abort()
    await stream.body?.cancel().catch(() => undefined)
    const update = events.find((event) => event.type === 'row.updated')
    if (update?.type !== 'row.updated') throw new Error('missing row update')
    expect(update.row.cells[nameId]).toBe('Grace')
    expect(update.row.cells[secretId]).toBeUndefined()
    expect(update.actorId).not.toBe(member.id)
  })
})
