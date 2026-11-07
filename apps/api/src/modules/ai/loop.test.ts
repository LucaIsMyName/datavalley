import { describe, expect, it } from 'vitest'
import { runChatLoop } from './loop.js'
import type { Complete } from './providers/types.js'

describe('ai chat loop', () => {
  it('passes tool results back and then stops', async () => {
    const seen: string[] = []
    const complete: Complete = async (input) => {
      const tool = input.messages.find((message) => message.role === 'tool')
      if (tool) {
        seen.push(tool.content)
        return { content: 'Found it', toolCalls: [] }
      }
      return { content: '', toolCalls: [{ id: 'call-1', name: 'ping', arguments: '{}' }] }
    }
    const result = await runChatLoop({
      complete,
      request: { provider: 'openai', baseUrl: 'https://example.com/v1', apiKey: 'secret', model: 'test', tools: [] },
      messages: [{ role: 'user', content: 'Where is Ada?' }],
      run: async () => ({ title: 'Ada' }),
    })
    expect(seen).toEqual(['{"title":"Ada"}'])
    expect(result.message).toBe('Found it')
  })

  it('stops after six tool rounds', async () => {
    let calls = 0
    const complete: Complete = async () => {
      calls += 1
      return { content: 'still looking', toolCalls: [{ id: String(calls), name: 'ping', arguments: '{}' }] }
    }
    const result = await runChatLoop({
      complete,
      request: { provider: 'ollama', baseUrl: 'http://127.0.0.1:11434', apiKey: '', model: 'test', tools: [] },
      messages: [{ role: 'user', content: 'hi' }],
      run: async () => ({ ok: true }),
    })
    expect(calls).toBe(6)
    expect(result.message).toBe('still looking')
  })
})
