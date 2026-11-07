import { describe, expect, it } from 'vitest'
import { chatTitle, rememberChat, removeChat, type StoredChat } from './chats.js'

const line = (role: 'user' | 'assistant', content: string) => ({ role, content })

describe('saved ask chats', () => {
  it('keeps a titled chat and drops an empty one', () => {
    const first = rememberChat([], 'a', [line('user', 'Where is Ada?')], 'Where is Ada?')
    expect(first).toHaveLength(1)
    expect(first[0]?.title).toBe('Where is Ada?')
    const updated = rememberChat(first, 'a', [line('user', 'Where is Ada?'), line('assistant', 'In People.')], 'Where is Ada?')
    expect(updated).toHaveLength(1)
    expect(updated[0]?.lines).toHaveLength(2)
    expect(rememberChat(updated, 'a', [], 'Where is Ada?')).toEqual([])
  })

  it('puts the chat you just wrote at the top and deletes by id', () => {
    const older: StoredChat = { id: 'old', title: 'Old', updatedAt: 1, lines: [line('user', 'Old')] }
    const next = rememberChat([older], 'new', [line('user', 'New question')], 'New question')
    expect(next.map((chat) => chat.id)).toEqual(['new', 'old'])
    expect(removeChat(next, 'old').map((chat) => chat.id)).toEqual(['new'])
  })

  it('clips a long first question for the title', () => {
    expect(chatTitle([line('user', 'a'.repeat(60))], 'Assistant').length).toBe(48)
    expect(chatTitle([], 'Assistant')).toBe('Assistant')
  })
})
