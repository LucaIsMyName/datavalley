// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AutomationCatalogTable, AutomationFlow } from '@datavalley/shared'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import en from '../../locales/en/common.json'
import { api } from '../../lib/api'
import { AutomationsPage } from './automations-page'

let provider: ReturnType<typeof createInstance>
let root: Root | undefined
let host: HTMLDivElement | undefined

const table: AutomationCatalogTable = {
  id: 'table-1',
  name: 'Orders',
  columns: [{ id: 'col-1', name: 'Name', type: 'text', toTableId: null, choices: [] }],
}

const flow: AutomationFlow = {
  id: 'flow-1',
  name: 'Notify',
  enabled: false,
  nodes: [
    {
      id: 'trigger-1',
      type: 'trigger',
      tableId: 'table-1',
      event: 'row_created',
      columnId: null,
      position: { x: 40, y: 40 },
    },
  ],
  edges: [],
}

describe('automation palette', () => {
  beforeAll(async () => {
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserver)
    provider = createInstance()
    await provider.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      defaultNS: 'common',
      resources: { en: { common: en } },
      interpolation: { escapeValue: false },
    })
  })

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = undefined
    host = undefined
    vi.restoreAllMocks()
  })

  it('adds a step when the palette button is clicked', async () => {
    vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path === '/projects/project-1/automations') {
        return { rules: [], flows: [flow], canEdit: true, tables: [table] }
      }
      throw new Error(String(path))
    })
    host = document.createElement('div')
    host.style.width = '800px'
    host.style.height = '600px'
    document.body.append(host)
    root = createRoot(host)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['automations', 'project-1'], {
      rules: [],
      flows: [flow],
      canEdit: true,
      tables: [table],
    })
    await act(async () => {
      root?.render(
        createElement(
          I18nextProvider,
          { i18n: provider },
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(
              MemoryRouter,
              { initialEntries: ['/projects/project-1/automations'] },
              createElement(
                Routes,
                null,
                createElement(Route, {
                  path: '/projects/:projectId/automations',
                  element: createElement(AutomationsPage),
                }),
              ),
            ),
          ),
        ),
      )
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(host.querySelectorAll('[data-step-icon="action"]')).toHaveLength(0)
    const action = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Action'))
    expect(action).toBeTruthy()
    await act(async () => {
      action?.click()
    })
    expect(host.querySelectorAll('[data-step-icon="action"]')).toHaveLength(1)
  })
})
