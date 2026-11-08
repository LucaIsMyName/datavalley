// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ApiKeysPage } from './admin-pages'

let provider: ReturnType<typeof createInstance>

function renderKeys(queryClient: QueryClient) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  act(() => {
    root.render(
      createElement(
        I18nextProvider,
        { i18n: provider },
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(MemoryRouter, { initialEntries: ['/settings/api-keys'] }, createElement(ApiKeysPage)),
        ),
      ),
    )
  })
  return { host, root }
}

describe('ApiKeysPage', () => {
  beforeAll(async () => {
    provider = createInstance()
    await provider.use(initReactI18next).init({
      lng: 'en',
      resources: {
        en: {
          translation: {
            apiKeys: 'API keys',
            name: 'Name',
            prefix: 'Prefix',
            actions: 'Actions',
            createKey: 'Create key',
            keyOnce: 'Copy this key now.',
            revoked: 'Revoked',
            revoke: 'Revoke',
            delete: 'Delete',
            settings: 'Settings',
          },
        },
      },
    })
  })

  let host: HTMLDivElement | undefined
  let root: Root | undefined

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  it('lists keys in a name, prefix, and actions table', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    queryClient.setQueryData(['api-keys'], {
      apiKeys: [
        { id: 'k1', name: 'CI', prefix: 'dv_abc', revokedAt: null },
        { id: 'k2', name: 'Old', prefix: 'dv_old', revokedAt: '2026-01-01T00:00:00.000Z' },
      ],
    })
    const rendered = renderKeys(queryClient)
    host = rendered.host
    root = rendered.root
    const headers = [...host.querySelectorAll('th')].map((cell) => cell.textContent?.trim())
    expect(headers).toEqual(['Name', 'Prefix', 'Actions'])
    const rows = [...host.querySelectorAll('tbody tr')]
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('CI')
    expect(rows[0]?.textContent).toContain('dv_abc...')
    expect(rows[0]?.textContent).toContain('Revoke')
    expect(rows[0]?.textContent).toContain('Delete')
    expect(rows[1]?.textContent).toContain('Revoked')
    expect([...rows[1]!.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Delete'])
    expect(rows[0]?.querySelectorAll('td')[0]?.className).toContain('border-r')
    expect(rows[0]?.querySelectorAll('td')[1]?.className).toContain('border-r')
    expect(rows[0]?.className).toContain('border-b')
  })
})
