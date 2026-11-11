// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import en from '../../locales/en/common.json'
import { PublicFormPage } from './public-form-page'

let provider: ReturnType<typeof createInstance>

let root: Root
let host: HTMLDivElement

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  vi.unstubAllGlobals()
})

describe('public form page', () => {
  beforeAll(async () => {
    provider = createInstance()
    await provider.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      defaultNS: 'common',
      resources: { en: { common: en } },
      interpolation: { escapeValue: false },
    })
  })

  it('shows the fields and sends the filled values', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'POST') {
        expect(url).toBe('/api/v1/public/forms/tok')
        expect(JSON.parse(String(init.body))).toEqual({ cells: { name: 'Ada' }, website: '' })
        return new Response(JSON.stringify({ id: 'row-1' }), { status: 200 })
      }
      return new Response(
        JSON.stringify({
          tableName: 'People',
          fields: [{ id: 'name', name: 'Name', type: 'text', options: [] }],
        }),
        { status: 200 },
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        createElement(
          I18nextProvider,
          { i18n: provider },
          createElement(
            MemoryRouter,
            { initialEntries: ['/forms/tok'] },
            createElement(
              Routes,
              null,
              createElement(Route, { path: '/forms/:token', element: createElement(PublicFormPage) }),
            ),
          ),
        ),
      )
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const input = host.querySelector('input')
    expect(host.textContent).toContain('People')
    expect(input).toBeTruthy()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      setter?.call(input, 'Ada')
      input?.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain('Sent. Thank you.')
  })
})
