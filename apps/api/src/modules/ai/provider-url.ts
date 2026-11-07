import type { AiProviderId } from '@datavalley/shared'
import { badRequest } from '../../errors.js'
import { assertPublicHost } from '../connectors/fetch.js'

function isLocalAiHost(hostname: string) {
  const host = hostname.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

export async function assertAiProviderBaseUrl(provider: AiProviderId, baseUrl: string) {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw badRequest('Invalid base URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw badRequest('Base URL must be http or https')
  if (provider === 'ollama') {
    if (!isLocalAiHost(url.hostname)) throw badRequest('Ollama base URL must point to localhost')
    return
  }
  await assertPublicHost(url.hostname)
}
