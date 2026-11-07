import { badRequest } from '../../../errors.js'
import { completeAnthropic } from './anthropic.js'
import { completeChat } from './chat-completions.js'
import type { Complete, CompleteInput } from './types.js'

let override: Complete | null = null

export function setCompleteForTests(next: Complete | null) {
  if (process.env.NODE_ENV !== 'test') return
  override = next
}

export async function complete(input: CompleteInput) {
  if (process.env.NODE_ENV === 'test' && override) return override(input)
  if (input.provider === 'anthropic') return completeAnthropic(input)
  if (input.provider === 'openai' || input.provider === 'mistral' || input.provider === 'spacexai' || input.provider === 'ollama') {
    return completeChat(input)
  }
  throw badRequest('Unknown AI provider')
}

export async function listOllamaModels(baseUrl: string) {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw badRequest('Invalid base URL')
  }
  const tagsUrl = `${url.protocol}//${url.host}/api/tags`
  let response: Response
  try {
    response = await fetch(tagsUrl, { signal: AbortSignal.timeout(8_000) })
  } catch {
    throw badRequest('Ollama did not respond')
  }
  if (!response.ok) throw badRequest(`Ollama did not respond (${response.status})`)
  const json = (await response.json()) as { models?: { name?: string; model?: string }[] }
  return (json.models ?? [])
    .map((model) => model.name || model.model || '')
    .filter(Boolean)
    .slice(0, 100)
    .map((id) => ({ id, label: id }))
}
