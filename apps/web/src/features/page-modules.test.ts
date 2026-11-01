import { describe, expect, it } from 'vitest'

const memory = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
    clear: () => memory.clear(),
  },
})

const modules: { path: string; names: string[] }[] = [
  {
    path: './auth/pages',
    names: ['LoginPage', 'ChangePasswordPage', 'ForgotPasswordPage', 'ResetPasswordPage'],
  },
  { path: './home/pages', names: ['DashboardPage', 'RecentPage', 'FavoritesPage'] },
  { path: './projects/projects-page', names: ['ProjectsPage'] },
  { path: './projects/project-page', names: ['ProjectPage'] },
  { path: './integrations/integrations-page', names: ['IntegrationsPage'] },
  { path: './settings/profile-page', names: ['ProfilePage'] },
  { path: './settings/admin-pages', names: ['UsersPage', 'ApiKeysPage', 'AuditPage'] },
  { path: './tables/grid', names: ['TableScreen'] },
]

describe('page modules', () => {
  it('exports each screen as a function', async () => {
    for (const entry of modules) {
      const loaded = (await import(entry.path)) as Record<string, unknown>
      for (const name of entry.names) {
        expect(typeof loaded[name], `${entry.path} ${name}`).toBe('function')
      }
    }
  })
})
