import { badRequest } from '../../../errors.js'
import type { AiChatMessage, AiCompletion, CompleteInput } from './types.js'

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string }

function toAnthropic(messages: AiChatMessage[]) {
  const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n')
  const turns: { role: 'user' | 'assistant'; content: string | AnthropicBlock[] }[] = []
  for (const message of messages) {
    if (message.role === 'system') continue
    if (message.role === 'user') {
      turns.push({ role: 'user', content: message.content })
      continue
    }
    if (message.role === 'tool') {
      const block: AnthropicBlock = { type: 'tool_result', tool_use_id: message.toolCallId ?? '', content: message.content }
      const last = turns.at(-1)
      if (last?.role === 'user' && Array.isArray(last.content)) last.content.push(block)
      else turns.push({ role: 'user', content: [block] })
      continue
    }
    const blocks: AnthropicBlock[] = []
    if (message.content) blocks.push({ type: 'text', text: message.content })
    for (const call of message.toolCalls ?? []) {
      let input: unknown = {}
      try {
        input = JSON.parse(call.arguments || '{}')
      } catch {
        input = {}
      }
      blocks.push({ type: 'tool_use', id: call.id, name: call.name, input })
    }
    turns.push({ role: 'assistant', content: blocks.length ? blocks : message.content })
  }
  return { system, messages: turns }
}

export async function completeAnthropic(input: CompleteInput): Promise<AiCompletion> {
  const { system, messages } = toAnthropic(input.messages)
  const body: Record<string, unknown> = {
    model: input.model,
    max_tokens: 2048,
    system,
    messages,
  }
  if (input.tools.length > 0) {
    body.tools = input.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }))
  }
  const root = input.baseUrl.replace(/\/$/, '')
  let response: Response
  try {
    response = await fetch(`${root}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': input.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    })
  } catch {
    throw badRequest('The model request failed')
  }
  if (!response.ok) throw badRequest(`The model request failed (${response.status})`)
  const json = (await response.json()) as { content?: { type?: string; text?: string; id?: string; name?: string; input?: unknown }[] }
  const blocks = json.content ?? []
  const content = blocks.filter((block) => block.type === 'text').map((block) => block.text ?? '').join('\n')
  const toolCalls = blocks.flatMap((block) => {
    if (block.type !== 'tool_use' || !block.id || !block.name) return []
    return [{ id: block.id, name: block.name, arguments: JSON.stringify(block.input ?? {}) }]
  })
  return { content, toolCalls }
}
