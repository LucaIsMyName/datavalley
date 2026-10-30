import type { User } from '@datavalley/api-client'
import { create } from 'zustand'

type SessionState = {
  user: User | null
  ready: boolean
  setUser: (user: User | null) => void
  setReady: (ready: boolean) => void
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  ready: false,
  setUser: (user) => set({ user }),
  setReady: (ready) => set({ ready }),
}))

export function applyTheme(theme: 'light' | 'dark' | 'system') {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  localStorage.setItem('theme', theme)
}
