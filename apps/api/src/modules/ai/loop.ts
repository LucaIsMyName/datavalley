import type { AiChatMessage, Complete, CompleteInput } from './providers/types.js'

const STEP_LIMIT = 6

export async function runChatLoop(input: {
  complete: Complete
  request: Omit<CompleteInput, 'messages'>
  messages: AiChatMessage[]
  run: (name: string, args: unknown) => Promise<unknown>
}) {
  const messages = [...input.messages]
  let last = ''
  for (let step = 0; step < STEP_LIMIT; step += 1) {
    const result = await input.complete({ ...input.request, messages })
    last = result.content.trim()
    if (result.toolCalls.length === 0) return { message: last || 'I could not answer that from the data you can view.' }
    messages.push({ role: 'assistant', content: result.content, toolCalls: result.toolCalls })
    for (const call of result.toolCalls) {
      let args: unknown = {}
      try {
        args = call.arguments ? JSON.parse(call.arguments) : {}
      } catch {
        args = null
      }
      const output = args == null ? { error: 'Invalid tool arguments' } : await input.run(call.name, args)
      messages.push({
        role: 'tool',
        toolCallId: call.id,
        content: JSON.stringify(output).slice(0, 12_000),
      })
    }
  }
  return { message: last || 'Ask a narrower question so I can finish within a few lookups.' }
}
