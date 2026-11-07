import { badRequest } from '../../../errors.js'
import type { AiChatMessage, AiCompletion, AiToolCall, CompleteInput } from './types.js'

function chatUrl(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/$/, '')
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`
  return `${trimmed}/v1/chat/completions`
}

function toMessages(messages: AiChatMessage[]) {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content }
    }
    if (message.role === 'assistant' && message.toolCalls?.length) {
      return {
        role: 'assistant',
        content: message.content || null,
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.arguments },
        })),
      }
    }
    return { role: message.role, content: message.content }
  })
}

function toolCallsOf(message: { tool_calls?: { id?: string; function?: { name?: string; arguments?: unknown } }[] }): AiToolCall[] {
  return (message.tool_calls ?? []).flatMap((call) => {
    const name = call.function?.name
    if (!call.id || !name) return []
    const args = call.function?.arguments
    return [{ id: call.id, name, arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}) }]
  })
}

export async function completeChat(input: CompleteInput): Promise<AiCompletion> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (input.apiKey) headers.authorization = `Bearer ${input.apiKey}`
  const body: Record<string, unknown> = {
    model: input.model,
    messages: toMessages(input.messages),
  }
  if (input.tools.length > 0) {
    body.tools = input.tools.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }))
  }
  let response: Response
  try {
    response = await fetch(chatUrl(input.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    })
  } catch {
    throw badRequest('The model request failed')
  }
  if (!response.ok) throw badRequest(`The model request failed (${response.status})`)
  const json = (await response.json()) as { choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: unknown } }[] } }[] }
  const message = json.choices?.[0]?.message
  return { content: message?.content ?? '', toolCalls: message ? toolCallsOf(message) : [] }
}
