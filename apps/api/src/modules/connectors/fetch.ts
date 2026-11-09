import { lookup as lookupCallback, type LookupAddress } from 'node:dns'
import { lookup } from 'node:dns/promises'
import { BlockList, isIP, type LookupFunction } from 'node:net'
import { Agent, fetch as undiciFetch, type RequestInfo, type RequestInit } from 'undici'
import { badRequest } from '../../errors.js'

const MAX_BYTES = 12 * 1024 * 1024
const TIMEOUT_MS = 30_000
const MAX_REDIRECTS = 5
const BLOCKED_CODE = 'EDATAVALLEY_BLOCKED_HOST'

// Separate lists: BlockList matches IPv4 addresses against IPv6 rules as IPv4-mapped, so `::ffff:0:0/96` would block every IPv4 address.
const privateIpv4 = new BlockList()
const privateIpv6 = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  privateIpv4.addSubnet(network, prefix, 'ipv4')
}
for (const [network, prefix] of [
  ['::', 96],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  privateIpv6.addSubnet(network, prefix, 'ipv6')
}

/** True for loopback, private, link-local, carrier-grade NAT, multicast, reserved, and IPv4-embedding IPv6 addresses. */
export function isPrivateIp(address: string) {
  const bare = address.replace(/^\[|\]$/g, '')
  const kind = isIP(bare)
  if (kind === 4) return privateIpv4.check(bare, 'ipv4')
  if (kind === 6) return privateIpv6.check(bare, 'ipv6')
  return false
}

function blockedHostError() {
  return Object.assign(new Error('URL host is not allowed'), { code: BLOCKED_CODE })
}

/**
 * DNS lookup used at connect time. Checking the addresses the socket actually connects to closes the
 * DNS-rebinding gap between `assertPublicHost` and the request.
 */
export const publicLookup: LookupFunction = (hostname, options, callback) => {
  lookupCallback(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
    if (error) return callback(error, '', 0)
    if (addresses.length === 0 || addresses.some((item) => isPrivateIp(item.address))) return callback(blockedHostError(), '', 0)
    if (options.all) return (callback as unknown as (error: null, addresses: LookupAddress[]) => void)(null, addresses)
    callback(null, addresses[0].address, addresses[0].family)
  })
}

const publicDispatcher = new Agent({ connect: { lookup: publicLookup } })

export function isBlockedHostError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if ((error as { code?: unknown }).code === BLOCKED_CODE) return true
  return isBlockedHostError((error as { cause?: unknown }).cause)
}

/** `fetch` for user-supplied URLs: every connection is pinned to an address that passed the public-host check. */
export function publicFetch(input: RequestInfo, init: RequestInit = {}) {
  return undiciFetch(input, { ...init, dispatcher: publicDispatcher })
}

export async function assertPublicHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
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
      const response = await publicFetch(current, { method, headers, redirect: 'manual', signal: controller.signal })
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
    if (isBlockedHostError(error)) throw badRequest('URL host is not allowed')
    throw error
  } finally {
    clearTimeout(timer)
  }
}
