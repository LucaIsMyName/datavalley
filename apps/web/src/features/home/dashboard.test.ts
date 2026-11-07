// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Project } from '@datavalley/api-client'
import { api } from '../../lib/api'
import { useSession } from '../../stores/session'
import { DashboardPage } from './pages'

const adminUser = {
  id: 'u1',
  username: 'admin',
  email: 'admin@example.com',
  role: 'admin',
  disabled: false,
  mustChangePassword: false,
  locale: 'en',
  timezone: 'UTC',
  theme: 'system',
  createdAt: '2026-01-01T00:00:00.000Z',
}

let provider: ReturnType<typeof createInstance>

function renderDashboard(queryClient: QueryClient) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  root.render(
    createElement(
      I18nextProvider,
      { i18n: provider },
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(DashboardPage)),
      ),
    ),
  )
  return { host, root }
}

describe('DashboardPage', () => {
  beforeAll(async () => {
    provider = createInstance()
    await provider.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      defaultNS: 'common',
      resources: {
        en: {
          common: {
            dashboard: 'Dashboard',
            projects: 'Projects',
            recent: 'Recent',
            favorites: 'Favorites',
            emptyProjects: 'No projects yet',
            emptyProjectsBody: 'Create a project to start collecting records.',
            emptyProjectsBodyViewer: 'Ask an admin to create a project.',
            recentEmpty: 'Nothing recent yet',
            favoritesEmpty: 'No favorites yet',
            viewAll: 'View all',
            newProject: 'New project',
            importProject: 'Import project',
            projectTableCount: '{{count}} tables',
            lastEdited: 'Last edited {{date}}',
            cancel: 'Cancel',
            create: 'Create',
            name: 'Name',
            customersTemplate: 'Customers template',
            importProjectChooseFile: 'Choose file',
            importProjectChangeFile: 'Change file',
            importProjectFileReady: 'Ready',
            importProjectConfirm: 'Import',
            error: 'Error',
          },
        },
      },
      interpolation: { escapeValue: false },
    })
  })

  afterEach(() => {
    useSession.setState({ user: null, ready: true })
    vi.restoreAllMocks()
  })

  it('shows empty projects copy when the list is empty', async () => {
    useSession.setState({ user: adminUser, ready: true })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    queryClient.setQueryData(['projects'], { projects: [] as Project[] })
    queryClient.setQueryData(['recents'], { recents: [] })
    queryClient.setQueryData(['favorites'], { favorites: [] })
    vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path === '/projects') return { projects: [] }
      if (path === '/recents') return { recents: [] }
      if (path === '/favorites') return { favorites: [] }
      throw new Error(path)
    })

    const { host, root } = renderDashboard(queryClient)
    await act(async () => {})
    expect(host.textContent).toContain('No projects yet')
    expect(host.textContent).toContain('Create a project to start collecting records.')
    await act(async () => root.unmount())
    host.remove()
  })

  it('shows new project for admins', async () => {
    useSession.setState({ user: adminUser, ready: true })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    queryClient.setQueryData(['projects'], { projects: [] as Project[] })
    queryClient.setQueryData(['recents'], { recents: [] })
    queryClient.setQueryData(['favorites'], { favorites: [] })
    vi.spyOn(api, 'request').mockImplementation(async (path: string) => {
      if (path === '/projects') return { projects: [] }
      if (path === '/recents') return { recents: [] }
      if (path === '/favorites') return { favorites: [] }
      throw new Error(path)
    })

    const { host, root } = renderDashboard(queryClient)
    await act(async () => {})
    expect(host.textContent).toContain('New project')
    await act(async () => root.unmount())
    host.remove()
  })
})
