// @vitest-environment happy-dom
import type { AutomationFlow } from '@datavalley/shared'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AutomationCanvas, SelectionActions } from './automation-canvas'
import en from '../../locales/en/common.json'

let provider: ReturnType<typeof createInstance>
let root: Root | undefined
let host: HTMLDivElement | undefined

const flow: AutomationFlow = {
  id: 'flow-canvas-1',
  name: 'Demo',
  enabled: false,
  nodes: [
    { id: 'trigger', type: 'trigger', tableId: 'orders', event: 'row_created', columnId: 'name', position: { x: 0, y: 0 } },
    { id: 'condition', type: 'condition', columnId: 'paid', op: 'is_true', value: null, position: { x: 0, y: 120 } },
    { id: 'switch', type: 'switch', columnId: 'status', cases: [{ id: 'open', optionIds: ['open'] }], position: { x: 0, y: 240 } },
    {
      id: 'action',
      type: 'action',
      action: 'create',
      tableId: 'tasks',
      linkColumnId: null,
      fields: [],
      position: { x: 280, y: 0 },
    },
  ],
  edges: [{ id: 'line-1', source: 'trigger', target: 'action', when: null }],
}

describe('automation canvas', () => {
  beforeAll(async () => {
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserver)
    provider = createInstance()
    await provider.use(initReactI18next).init({ lng: 'en', resources: { en: { translation: en } } })
  })

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = undefined
    host = undefined
  })

  it('shows an icon for each step and deletes a selected line without removing steps', async () => {
    host = document.createElement('div')
    host.style.width = '800px'
    host.style.height = '600px'
    document.body.append(host)
    root = createRoot(host)
    const removedNodes: string[][] = []
    const removedEdges: string[][] = []
    await act(async () => {
      root?.render(
        createElement(
          I18nextProvider,
          { i18n: provider },
          createElement(AutomationCanvas, {
            flow,
            tables: [],
            issues: [],
            readOnly: false,
            selection: { kind: 'edge', id: 'line-1' },
            onSelect: () => undefined,
            onMove: () => undefined,
            onConnectEdge: () => undefined,
            onRemoveNodes: (ids) => removedNodes.push(ids),
            onRemoveEdges: (ids) => removedEdges.push(ids),
            onAdd: () => undefined,
          }),
        ),
      )
    })
    expect([...host.querySelectorAll('[data-step-icon]')].map((node) => node.getAttribute('data-step-icon'))).toEqual([
      'trigger',
      'condition',
      'switch',
      'action',
    ])
    expect(host.querySelectorAll('[data-step-icon]')).toHaveLength(4)

    const lineHost = document.createElement('div')
    document.body.append(lineHost)
    const lineRoot = createRoot(lineHost)
    await act(async () => {
      lineRoot.render(
        createElement(
          I18nextProvider,
          { i18n: provider },
          createElement(SelectionActions, {
            onEdit: () => undefined,
            onDelete: () => removedEdges.push(['line-1']),
          }),
        ),
      )
    })
    const remove = [...lineHost.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Delete')
    expect(remove).toBeTruthy()
    await act(async () => {
      remove?.click()
    })
    expect(removedEdges).toEqual([['line-1']])
    expect(removedNodes).toEqual([])
    expect(host.querySelectorAll('[data-step-icon]')).toHaveLength(4)
    act(() => lineRoot.unmount())
    lineHost.remove()
  })

  it('renders edit and delete for a selection', async () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    let edited = false
    let deleted = false
    await act(async () => {
      root?.render(
        createElement(
          I18nextProvider,
          { i18n: provider },
          createElement(SelectionActions, {
            onEdit: () => {
              edited = true
            },
            onDelete: () => {
              deleted = true
            },
          }),
        ),
      )
    })
    const edit = [...host.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Edit')
    const remove = [...host.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === 'Delete')
    await act(async () => {
      edit?.click()
      remove?.click()
    })
    expect(edited).toBe(true)
    expect(deleted).toBe(true)
  })
})
