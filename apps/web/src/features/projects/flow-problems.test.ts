// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import { FlowProblemList } from './flow-problems'

let provider: ReturnType<typeof createInstance>
let root: Root
let host: HTMLDivElement

beforeAll(async () => {
  provider = createInstance()
  await provider.use(initReactI18next).init({
    lng: 'en',
    resources: {
      en: {
        translation: {
          flowNoProblems: 'This flow can run.',
          flowIssue_type_mismatch: 'That value does not fit this column.',
        },
      },
    },
  })
})

describe('flow problems', () => {
  it('shows a column mismatch and stays quiet when the flow fits', async () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    await act(async () => {
      root.render(
        createElement(
          I18nextProvider,
          { i18n: provider },
          createElement(FlowProblemList, { issues: [{ nodeId: 'make', code: 'type_mismatch' }] }),
        ),
      )
    })
    expect(host.textContent).toContain('That value does not fit this column.')
    await act(async () => {
      root.render(createElement(I18nextProvider, { i18n: provider }, createElement(FlowProblemList, { issues: [] })))
    })
    expect(host.textContent).toContain('This flow can run.')
    await act(async () => root.unmount())
    host.remove()
  })
})
