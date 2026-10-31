import { describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login, type Harness } from './harness.js'

const password = 'test-password-12'

function pngPayload(boundary: string) {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="dot.png"\r\nContent-Type: image/png\r\n\r\n`
  const tail = `\r\n--${boundary}--\r\n`
  return Buffer.concat([Buffer.from(head), png, Buffer.from(tail)])
}

async function sessionFor(harness: Harness, username: string) {
  const session = await new ApiSession(harness.app).prepare()
  await login(session, username, password)
  return session
}

describe('media access', () => {
  let harness: Harness

  it('scopes uploads to a table and hides files from other users', async () => {
    harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada@example.com',
      password,
      role: 'admin',
    })
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'cam',
      email: 'cam@example.com',
      password,
      role: 'user',
    })
    const ada = await sessionFor(harness, 'ada')
    const cam = await sessionFor(harness, 'cam')

    const project = await ada.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Media' } })
    const projectId = project.json().project.id as string
    const table = await ada.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Files' },
    })
    const tableId = table.json().table.id as string
    const boundary = 'dvMediaTest'
    const uploaded = await ada.inject({
      method: 'POST',
      url: `/api/v1/media?tableId=${tableId}`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: pngPayload(boundary),
    })
    expect(uploaded.statusCode).toBe(200)
    const fileId = uploaded.json().file.id as string

    const allowed = await ada.inject({ method: 'GET', url: `/api/v1/media/${fileId}` })
    expect(allowed.statusCode).toBe(200)

    const blocked = await cam.inject({ method: 'GET', url: `/api/v1/media/${fileId}` })
    expect(blocked.statusCode).toBe(404)

    await harness.close()
  })
})
