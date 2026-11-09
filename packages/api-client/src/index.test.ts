import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, DatavalleyClient } from './index.js'

function respond(status: number, body: string, statusText = '') {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status, statusText })))
}

describe('DatavalleyClient.request', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the parsed JSON body and an empty object for an empty body', async () => {
    const client = new DatavalleyClient('/api')
    respond(200, '{"ok":true}')
    await expect(client.request('/x')).resolves.toEqual({ ok: true })
    respond(200, '')
    await expect(client.request('/x')).resolves.toEqual({})
  })

  it('throws an ApiClientError with the server error code', async () => {
    const client = new DatavalleyClient('/api')
    respond(409, '{"error":{"code":"version_conflict","message":"Row was updated elsewhere"}}')
    const error = await client.request('/x').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiClientError)
    expect((error as ApiClientError).status).toBe(409)
    expect((error as ApiClientError).code).toBe('version_conflict')
  })

  it('turns a non-JSON error page into an ApiClientError instead of a SyntaxError', async () => {
    const client = new DatavalleyClient('/api')
    respond(502, '<html>Bad gateway</html>', 'Bad Gateway')
    const error = await client.request('/x').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiClientError)
    expect((error as ApiClientError).status).toBe(502)
    expect((error as ApiClientError).message).toBe('Bad Gateway')
  })

  it('rejects a successful response whose body is not JSON', async () => {
    const client = new DatavalleyClient('/api')
    respond(200, 'not json')
    const error = await client.request('/x').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiClientError)
    expect((error as ApiClientError).code).toBe('invalid_response')
  })
})
