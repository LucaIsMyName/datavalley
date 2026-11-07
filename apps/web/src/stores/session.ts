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

let systemThemeMedia: MediaQueryList | null = null
let systemThemeListener: (() => void) | null = null

export function applyTheme(theme: 'light' | 'dark' | 'system') {
  if (systemThemeMedia && systemThemeListener) {
    systemThemeMedia.removeEventListener('change', systemThemeListener)
    systemThemeMedia = null
    systemThemeListener = null
  }
  const sync = () => {
    const dark =
      theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
  }
  sync()
  localStorage.setItem('theme', theme)
  if (theme === 'system') {
    systemThemeMedia = window.matchMedia('(prefers-color-scheme: dark)')
    systemThemeListener = sync
    systemThemeMedia.addEventListener('change', systemThemeListener)
  }
}
