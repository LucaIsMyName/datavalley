// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { MediaEditor, mergeMediaIntoCell } from './media-cell'

vi.mock('../../lib/api', () => ({
  api: { request: vi.fn(async () => ({ files: [], nextCursor: null })) },
}))

describe('mergeMediaIntoCell', () => {
  it('appends new file ids to existing cell value', () => {
    expect(mergeMediaIntoCell({ fileIds: ['a'] }, ['b'])).toEqual({ fileIds: ['a', 'b'] })
  })

  it('starts from empty cell', () => {
    expect(mergeMediaIntoCell(null, ['x'])).toEqual({ fileIds: ['x'] })
  })
})

describe('MediaEditor idle actions', () => {
  let provider: ReturnType<typeof createInstance>
  let host: HTMLDivElement
  let root: Root

  beforeAll(async () => {
    provider = createInstance()
    await provider.use(initReactI18next).init({
      lng: 'en',
      resources: { en: { translation: { mediaUpload: 'Upload', mediaLibrary: 'Library', mediaAttach: 'Attach' } } },
    })
  })

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
  })

  function renderEditor(idleActions: boolean) {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    act(() => {
      root.render(
        createElement(
          I18nextProvider,
          { i18n: provider },
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(MediaEditor, {
              value: null,
              active: false,
              uploading: false,
              idleActions,
              onCommit: async () => undefined,
              onOpen: () => undefined,
              onActivate: () => undefined,
              onOpenLibrary: () => undefined,
              onPreviewFile: () => undefined,
              onRequestUpload: () => undefined,
            }),
          ),
        ),
      )
    })
  }

  it('shows upload and library when the cell is idle and empty', () => {
    renderEditor(true)
    expect(host.querySelector('[aria-label="Upload"]')).toBeTruthy()
    expect(host.querySelector('[aria-label="Library"]')).toBeTruthy()
  })

  it('hides those buttons on an idle grid cell', () => {
    renderEditor(false)
    expect(host.querySelector('[aria-label="Upload"]')).toBeNull()
    expect(host.querySelector('[aria-label="Library"]')).toBeNull()
  })
})
