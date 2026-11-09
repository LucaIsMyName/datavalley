// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'
import { AppDialog } from './app-dialog'

describe('AppDialog', () => {
  it('closes from its labelled close button', async () => {
    const provider = createInstance()
    await provider.use(initReactI18next).init({
      lng: 'en',
      defaultNS: 'common',
      resources: { en: { common: { close: 'Close' } } },
    })
    const onOpenChange = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => {
      root.render(
        createElement(
          I18nextProvider,
          { i18n: provider },
          createElement(AppDialog, { open: true, onOpenChange, title: 'Rename', children: createElement('input', { 'aria-label': 'Name' }) }),
        ),
      )
    })
    const close = document.querySelector<HTMLButtonElement>('button[aria-label="Close"]')
    expect(close).not.toBeNull()
    act(() => close?.click())
    expect(onOpenChange).toHaveBeenCalledWith(false)
    act(() => root.unmount())
    host.remove()
  })
})
