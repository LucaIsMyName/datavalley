import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { badRequest } from '../../errors.js'

const MAX_BYTES = 12 * 1024 * 1024
const TIMEOUT_MS = 30_000
const MAX_REDIRECTS = 5

function isPrivateIp(address: string) {
  if (address === '::1' || address === '0:0:0:0:0:0:0:1') return true
  const kind = isIP(address)
  if (kind === 4) {
    const parts = address.split('.').map(Number)
    if (parts[0] === 10) return true
    if (parts[0] === 127) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    return false
  }
  if (kind === 6) {
    const lower = address.toLowerCase()
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true
  }
  return false
}

async function assertPublicHost(hostname: string) {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw badRequest('URL host is not allowed')
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw badRequest('URL host is not allowed')
    return
  }
  const records = await lookup(host, { all: true })
  if (records.length === 0) throw badRequest('URL host could not be resolved')
  for (const record of records) {
    if (isPrivateIp(record.address)) throw badRequest('URL host is not allowed')
  }
}

export function resolveConnectorUrl(source: { baseUrl: string; pathTemplate?: string; query?: Record<string, string> }) {
  const base = source.baseUrl.trim()
  let url: URL
  try {
    url = new URL(base)
  } catch {
    throw badRequest('Invalid base URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw badRequest('URL must be http or https')
  if (source.pathTemplate) {
    const path = source.pathTemplate.startsWith('/') ? source.pathTemplate : `/${source.pathTemplate}`
    url.pathname = `${url.pathname.replace(/\/$/, '')}${path}`
  }
  if (source.query) {
    for (const [key, value] of Object.entries(source.query)) url.searchParams.set(key, value)
  }
  return url
}

export type ConnectorAuthConfig = {
  type: 'none' | 'api_key_header' | 'api_key_query'
  headerName?: string
  queryParam?: string
}

export async function fetchConnectorPayload(
  source: { baseUrl: string; pathTemplate?: string; method?: 'GET' | 'POST'; query?: Record<string, string>; headers?: Record<string, string> },
  auth: ConnectorAuthConfig,
  apiKey: string | null,
) {
  const url = resolveConnectorUrl(source)
  await assertPublicHost(url.hostname)
  const headers: Record<string, string> = { ...(source.headers ?? {}), accept: '*/*' }
  if (auth.type === 'api_key_header' && apiKey) {
    headers[auth.headerName?.trim() || 'Authorization'] = apiKey
  }
  if (auth.type === 'api_key_query' && apiKey) {
    url.searchParams.set(auth.queryParam?.trim() || 'api_key', apiKey)
  }
  const method = source.method ?? 'GET'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    let current = url
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      await assertPublicHost(current.hostname)
      const response = await fetch(current, { method, headers, redirect: 'manual', signal: controller.signal })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) throw badRequest('Redirect response missing location')
        current = new URL(location, current)
        continue
      }
      if (!response.ok) throw badRequest(`Remote URL returned ${response.status}`)
      const reader = response.body?.getReader()
      if (!reader) return ''
      const chunks: Uint8Array[] = []
      let total = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        total += value.byteLength
        if (total > MAX_BYTES) throw badRequest('Remote response is too large')
        chunks.push(value)
      }
      return Buffer.concat(chunks).toString('utf8')
    }
    throw badRequest('Too many redirects')
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw badRequest('Remote request timed out')
    throw error
  } finally {
    clearTimeout(timer)
  }
}
