// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import { SelectCellOptionsPanel } from './select-cell-options-panel'

let provider: ReturnType<typeof createInstance>

const options = [
  { id: 'qualified', label: 'Qualified', color: null, position: 'a0' },
  { id: 'proposal', label: 'Proposal', color: null, position: 'a1' },
]

describe('select cell options', () => {
  beforeAll(async () => {
    provider = createInstance()
    await provider.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      defaultNS: 'common',
      resources: {
        en: {
          common: {
            none: 'None',
            newSelectOption: 'New option',
            addSelectOption: 'Add',
            renameSelectOption: 'Rename option',
            deleteSelectOption: 'Delete option {{label}}',
            deleteSelectOptionConfirm: 'Delete {{label}}?',
          },
        },
      },
      interpolation: { escapeValue: false },
    })
  })

  function renderPanel() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    act(() => {
      root.render(
        createElement(
          I18nextProvider,
          { i18n: provider },
          createElement(SelectCellOptionsPanel, {
            columnId: 'stage',
            options,
            multiple: false,
            selectedIds: [],
            singleSelected: 'qualified',
            createDraft: '',
            createBusy: false,
            onCreateDraftChange: () => undefined,
            onCreateOption: () => undefined,
            onOptionChange: () => undefined,
            onToggleMulti: () => undefined,
            onPickSingle: () => undefined,
            onPickNone: () => undefined,
          }),
        ),
      )
    })
    return { host, root }
  }

  it('keeps the check, label, and actions inside the selected row', async () => {
    const { host, root } = renderPanel()
    await act(async () => {})
    const selected = [...host.querySelectorAll('div')].find(
      (row) => row.className.includes('bg-muted') && row.textContent?.includes('Qualified'),
    )
    expect(selected).toBeTruthy()
    expect(selected?.querySelector('svg')).toBeTruthy()
    expect(selected?.querySelector('button[aria-label="Rename option"]')).toBeTruthy()
    expect(selected?.querySelector('button[aria-label="Delete option Qualified"]')).toBeTruthy()
    expect(selected?.querySelector('input')).toBeNull()
    const label = [...(selected?.querySelectorAll('button') ?? [])].find((button) => button.textContent === 'Qualified')
    expect(label).toBeTruthy()
    const proposal = [...host.querySelectorAll('div')].find(
      (row) =>
        row.className.includes('hover:bg-accent') &&
        [...row.querySelectorAll('button')].some((button) => button.textContent === 'Proposal'),
    )
    expect(proposal?.className).not.toContain('bg-muted')
    expect(proposal?.querySelector('input')).toBeNull()
    await act(async () => root.unmount())
    host.remove()
  })
})