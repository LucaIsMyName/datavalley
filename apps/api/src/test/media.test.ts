import { describe, expect, it } from 'vitest'
import { ApiSession, createHarness, createUser, login, type Harness } from './harness.js'

const password = 'test-password-12'

function pngPayload(boundary: string) {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="dot.png"\r\nContent-Type: image/png\r\n\r\n`
  const tail = `\r\n--${boundary}--\r\n`
  return Buffer.concat([Buffer.from(head), png, Buffer.from(tail)])
}

function pdfPayload(boundary: string) {
  const pdf = Buffer.from('%PDF-1.4\n')
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="doc.pdf"\r\nContent-Type: application/pdf\r\n\r\n`
  const tail = `\r\n--${boundary}--\r\n`
  return Buffer.concat([Buffer.from(head), pdf, Buffer.from(tail)])
}

async function sessionFor(harness: Harness, username: string) {
  const session = await new ApiSession(harness.app).prepare()
  await login(session, username, password)
  return session
}

describe('media access', () => {
  it('scopes uploads to a table and hides files from other users', async () => {
    const harness = await createHarness()
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

  it('serves pdf with inline disposition for embedded preview', async () => {
    const harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'pdf',
      email: 'pdf@example.com',
      password,
      role: 'admin',
    })
    const session = await sessionFor(harness, 'pdf')
    const boundary = 'dvPdf'
    const uploaded = await session.inject({
      method: 'POST',
      url: '/api/v1/media',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: pdfPayload(boundary),
    })
    expect(uploaded.statusCode).toBe(200)
    const fileId = uploaded.json().file.id as string
    const response = await session.inject({ method: 'GET', url: `/api/v1/media/${fileId}` })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-disposition']).toMatch(/^inline;/)
    await harness.close()
  })

  it('lists library uploads for the uploader and supports multi-file cells', async () => {
    const harness = await createHarness()
    await createUser(harness.db, harness.env, harness.organizationId, {
      username: 'ada',
      email: 'ada2@example.com',
      password,
      role: 'admin',
    })
    const ada = await sessionFor(harness, 'ada')
    const project = await ada.inject({ method: 'POST', url: '/api/v1/projects', payload: { name: 'Library' } })
    const projectId = project.json().project.id as string
    const table = await ada.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tables`,
      payload: { name: 'Assets' },
    })
    const tableId = table.json().table.id as string
    const boundary = 'dvLibrary'
    const library = await ada.inject({
      method: 'POST',
      url: '/api/v1/media',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: pngPayload(boundary),
    })
    expect(library.statusCode).toBe(200)
    const libraryId = library.json().file.id as string
    const listed = await ada.inject({ method: 'GET', url: '/api/v1/media' })
    expect(listed.statusCode).toBe(200)
    expect(listed.json().files.map((file: { id: string }) => file.id)).toContain(libraryId)

    const column = await ada.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/columns`,
      payload: { name: 'Attachments', type: 'media' },
    })
    const columnId = column.json().column.id as string
    const tableUpload = await ada.inject({
      method: 'POST',
      url: `/api/v1/media?tableId=${tableId}`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: pngPayload(boundary),
    })
    const tableFileId = tableUpload.json().file.id as string
    const row = await ada.inject({
      method: 'POST',
      url: `/api/v1/tables/${tableId}/rows`,
      payload: { cells: {} },
    })
    const rowId = row.json().row.id as string
    const patched = await ada.inject({
      method: 'PATCH',
      url: `/api/v1/rows/${rowId}`,
      payload: { version: 1, cells: { [columnId]: { fileIds: [libraryId, tableFileId] } } },
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().row.cells[columnId]).toEqual({ fileIds: [libraryId, tableFileId] })

    await harness.close()
  })
})
