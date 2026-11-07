// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Project } from '@datavalley/api-client'
import { ProjectCard, sortProjectsByLastEdited } from './project-card'

const baseProject = (overrides: Partial<Project>): Project => ({
  id: 'p1',
  name: 'Alpha',
  description: '',
  icon: 'folder',
  archivedAt: null,
  organizationId: 'org',
  updatedAt: '2026-01-01T00:00:00.000Z',
  tableCount: 2,
  lastEditedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

let provider: ReturnType<typeof createInstance>

describe('sortProjectsByLastEdited', () => {
  it('orders projects by lastEditedAt descending', () => {
    const sorted = sortProjectsByLastEdited([
      baseProject({ id: 'old', lastEditedAt: '2026-01-01T00:00:00.000Z' }),
      baseProject({ id: 'new', lastEditedAt: '2026-02-01T00:00:00.000Z' }),
    ])
    expect(sorted.map((p) => p.id)).toEqual(['new', 'old'])
  })
})

describe('ProjectCard', () => {
  beforeAll(async () => {
    provider = createInstance()
    await provider.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      defaultNS: 'common',
      resources: {
        en: {
          common: {
            projectTableCount: '{{count}} tables',
            lastEdited: 'Last edited {{date}}',
            menu: 'Menu',
          },
        },
      },
      interpolation: { escapeValue: false },
    })
  })

  function renderCard(project: Project) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    root.render(
      createElement(
        I18nextProvider,
        { i18n: provider },
        createElement(MemoryRouter, null, createElement(ProjectCard, { project })),
      ),
    )
    return { host, root }
  }

  it('shows name, table count, and last edited', async () => {
    const { host, root } = renderCard(baseProject({ name: 'CRM Hub' }))
    await act(async () => {})
    expect(host.textContent).toContain('CRM Hub')
    expect(host.textContent).toContain('2 tables')
    expect(host.textContent).toContain('Last edited')
    await act(async () => root.unmount())
    host.remove()
  })

  it('omits description when empty', async () => {
    const { host, root } = renderCard(baseProject({ description: '   ' }))
    await act(async () => {})
    const lines = host.querySelectorAll('p')
    expect(lines.length).toBe(1)
    await act(async () => root.unmount())
    host.remove()
  })

  it('shows a truncated description when set', async () => {
    const { host, root } = renderCard(baseProject({ description: 'Quarterly planning workspace' }))
    await act(async () => {})
    expect(host.textContent).toContain('Quarterly planning workspace')
    expect(host.querySelector('.line-clamp-2')).not.toBeNull()
    await act(async () => root.unmount())
    host.remove()
  })
})
