import { describe, expect, it } from 'vitest'
import { CHAT_OPEN_KEY, readAiChatOpen, writeAiChatOpen } from './chat-open-state.js'

describe('ai chat open state', () => {
  it('defaults to closed when unset or invalid', () => {
    const storage = { getItem: () => null, setItem: () => {} }
    expect(readAiChatOpen(storage)).toBe(false)
    expect(readAiChatOpen({ getItem: () => 'yes' })).toBe(false)
  })

  it('round-trips open and closed', () => {
    let value: string | null = null
    const storage = {
      getItem: (key: string) => (key === CHAT_OPEN_KEY ? value : null),
      setItem: (key: string, next: string) => {
        if (key === CHAT_OPEN_KEY) value = next
      },
    }
    expect(readAiChatOpen(storage)).toBe(false)
    writeAiChatOpen(true, storage)
    expect(readAiChatOpen(storage)).toBe(true)
    writeAiChatOpen(false, storage)
    expect(readAiChatOpen(storage)).toBe(false)
  })
})
