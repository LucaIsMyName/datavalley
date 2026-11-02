// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Sidebar, SidebarProvider } from '../components/ui/sidebar'
import { SideNav } from './app-shell'

const strings = {
  appName: 'Datavalley',
  toggleSidebar: 'Toggle sidebar',
  dashboard: 'Dashboard',
  projects: 'Projects',
  recent: 'Recent',
  favorites: 'Favorites',
  media: 'Media',
  docs: 'Docs',
  integrations: 'Integrations',
  settings: 'Settings',
  logout: 'Log out',
}

function renderNav({
  open,
  showCollapse = true,
  onOpenChange,
}: {
  open: boolean
  showCollapse?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  root.render(
    createElement(
      I18nextProvider,
      { i18n: provider },
      createElement(
        MemoryRouter,
        null,
        createElement(
          SidebarProvider,
          { open, onOpenChange },
          createElement(Sidebar, null, createElement(SideNav, { showCollapse })) as ReactNode,
        ),
      ),
    ),
  )
  return { host, root }
}

let provider: ReturnType<typeof createInstance>

describe('SideNav', () => {
  beforeAll(async () => {
    provider = createInstance()
    await provider.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      defaultNS: 'common',
      resources: { en: { common: strings } },
      interpolation: { escapeValue: false },
    })
  })

  it('shows the app name, toggle, and labeled links when pinned open', async () => {
    const { host, root } = renderNav({ open: true })
    await act(async () => {})
    expect(host.textContent).toContain('Datavalley')
    expect(host.textContent).toContain('Dashboard')
    expect(host.textContent).toContain('Projects')
    expect(host.querySelector('[data-sidebar="trigger"]')?.getAttribute('aria-label')).toBe('Toggle sidebar')
    expect(host.querySelector('[data-sidebar="trigger"]')?.getAttribute('aria-expanded')).toBe('true')
    expect(host.querySelector('[data-sidebar="brand"]')?.className).toContain('h-10')
    await act(async () => root.unmount())
    host.remove()
  })

  it('keeps nav labels in the document when pinned closed', async () => {
    const { host, root } = renderNav({ open: false })
    await act(async () => {})
    expect(host.textContent).toContain('Dashboard')
    expect(host.textContent).toContain('Media')
    expect(host.textContent).toContain('Log out')
    expect(host.querySelector('[data-state="collapsed"]')).toBeTruthy()
    expect(host.querySelector('[data-collapsible="icon"]')).toBeTruthy()
    expect(host.querySelector('.group\\/sidebar-panel')?.className).toContain('z-40')
    expect(host.querySelector('[data-sidebar="brand"]')?.className).toContain('h-10')
    await act(async () => root.unmount())
    host.remove()
  })

  it('toggles the pinned state from the header button', async () => {
    const onOpenChange = vi.fn()
    const { host, root } = renderNav({ open: true, onOpenChange })
    await act(async () => {})
    const trigger = host.querySelector('[data-sidebar="trigger"]')
    expect(trigger).toBeTruthy()
    await act(async () => {
      ;(trigger as HTMLButtonElement).click()
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    await act(async () => root.unmount())
    host.remove()
  })

  it('omits the collapse control on the mobile nav', async () => {
    const { host, root } = renderNav({ open: true, showCollapse: false })
    await act(async () => {})
    expect(host.textContent).toContain('Datavalley')
    expect(host.querySelector('[data-sidebar="trigger"]')).toBeNull()
    await act(async () => root.unmount())
    host.remove()
  })
})
