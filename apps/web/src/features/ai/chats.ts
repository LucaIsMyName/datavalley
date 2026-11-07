export type StoredChatLine = {
  role: 'user' | 'assistant'
  content: string
  proposals?: unknown[]
  highlights?: unknown[]
}

export type StoredChat = {
  id: string
  title: string
  updatedAt: number
  lines: StoredChatLine[]
}

const CHATS_KEY = 'datavalley.ai.chats'
const ACTIVE_KEY = 'datavalley.ai.activeChat'
const LIMIT = 40

export function chatTitle(lines: { role: string; content: string }[], fallback: string) {
  const first = lines.find((line) => line.role === 'user')?.content.trim() ?? ''
  if (!first) return fallback
  return first.length > 48 ? `${first.slice(0, 47)}…` : first
}

export function rememberChat(chats: StoredChat[], id: string, lines: StoredChatLine[], title: string, updatedAt = Date.now()) {
  if (lines.length === 0) return chats.filter((chat) => chat.id !== id)
  const next = { id, title, updatedAt, lines }
  return [next, ...chats.filter((chat) => chat.id !== id)].slice(0, LIMIT)
}

export function removeChat(chats: StoredChat[], id: string) {
  return chats.filter((chat) => chat.id !== id)
}

function storage() {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

export function loadChats(): StoredChat[] {
  const store = storage()
  if (!store) return []
  try {
    const parsed = JSON.parse(store.getItem(CHATS_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const chat = item as StoredChat
      if (typeof chat.id !== 'string' || !Array.isArray(chat.lines)) return []
      return [{ id: chat.id, title: typeof chat.title === 'string' ? chat.title : '', updatedAt: Number(chat.updatedAt) || 0, lines: chat.lines }]
    })
  } catch {
    return []
  }
}

export function writeChats(chats: StoredChat[]) {
  storage()?.setItem(CHATS_KEY, JSON.stringify(chats))
}

export function readActiveChat() {
  return storage()?.getItem(ACTIVE_KEY) ?? null
}

export function writeActiveChat(id: string) {
  storage()?.setItem(ACTIVE_KEY, id)
}
