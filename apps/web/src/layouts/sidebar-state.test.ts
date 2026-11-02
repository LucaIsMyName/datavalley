import { describe, expect, it } from 'vitest'
import { readSidebarOpen, SIDEBAR_STORAGE_KEY, writeSidebarOpen } from './sidebar-state'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    data,
  }
}

describe('readSidebarOpen', () => {
  it('defaults to open when nothing is stored', () => {
    expect(readSidebarOpen(memoryStorage())).toBe(true)
  })

  it('reads a closed pin', () => {
    expect(readSidebarOpen(memoryStorage({ [SIDEBAR_STORAGE_KEY]: 'closed' }))).toBe(false)
  })

  it('reads an open pin', () => {
    expect(readSidebarOpen(memoryStorage({ [SIDEBAR_STORAGE_KEY]: 'open' }))).toBe(true)
  })

  it('treats invalid values as open', () => {
    expect(readSidebarOpen(memoryStorage({ [SIDEBAR_STORAGE_KEY]: 'maybe' }))).toBe(true)
  })
})

describe('writeSidebarOpen', () => {
  it('persists open and closed values', () => {
    const storage = memoryStorage()
    writeSidebarOpen(false, storage)
    expect(storage.getItem(SIDEBAR_STORAGE_KEY)).toBe('closed')
    expect(readSidebarOpen(storage)).toBe(false)
    writeSidebarOpen(true, storage)
    expect(storage.getItem(SIDEBAR_STORAGE_KEY)).toBe('open')
    expect(readSidebarOpen(storage)).toBe(true)
  })
})
