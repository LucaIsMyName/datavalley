// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import { LoadingBlock } from './states'

let provider: ReturnType<typeof createInstance>

describe('LoadingBlock', () => {
  beforeAll(async () => {
    provider = createInstance()
    await provider.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      defaultNS: 'common',
      resources: { en: { common: { loading: 'Loading' } } },
      interpolation: { escapeValue: false },
    })
  })

  function render(variant?: 'block' | 'table' | 'cards' | 'rows') {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    act(() => {
      root.render(
        createElement(
          I18nextProvider,
          { i18n: provider },
          createElement(LoadingBlock, { variant }),
        ),
      )
    })
    return { host, root }
  }

  it('keeps a single pulse block when no variant is passed', async () => {
    const { host, root } = render()
    await act(async () => {})
    const status = host.querySelector('[role="status"]')
    expect(status?.className).toContain('h-40')
    expect(status?.className).toContain('animate-pulse')
    expect(status?.textContent).toContain('Loading')
    expect(host.querySelectorAll('[role="status"]').length).toBe(1)
    await act(async () => root.unmount())
    host.remove()
  })

  it('renders a header and rows for the table variant', async () => {
    const { host, root } = render('table')
    await act(async () => {})
    const status = host.querySelector('[role="status"]')
    expect(status?.className).toContain('border')
    expect(status?.querySelectorAll(':scope > div').length).toBe(6)
    expect(status?.textContent).toContain('Loading')
    await act(async () => root.unmount())
    host.remove()
  })

  it('renders a card grid for the cards variant', async () => {
    const { host, root } = render('cards')
    await act(async () => {})
    const status = host.querySelector('[role="status"]')
    expect(status?.className).toContain('grid')
    expect(status?.querySelectorAll(':scope > div').length).toBe(6)
    await act(async () => root.unmount())
    host.remove()
  })

  it('renders stacked lines for the rows variant', async () => {
    const { host, root } = render('rows')
    await act(async () => {})
    const status = host.querySelector('[role="status"]')
    expect(status?.querySelectorAll(':scope > div').length).toBe(4)
    expect(status?.className).not.toContain('h-40')
    await act(async () => root.unmount())
    host.remove()
  })
})
