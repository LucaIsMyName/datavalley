// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import { beforeAll, describe, expect, it } from 'vitest'
import { RecordActivityList, type RecordActivityItem } from './record-activity'

let provider: ReturnType<typeof createInstance>
let root: Root
let host: HTMLDivElement

const items: RecordActivityItem[] = [
  {
    at: '2026-11-08T10:00:00.000Z',
    kind: 'notes',
    text: 'Call next week',
    tableId: 'deals',
    tableName: 'Deals',
    rowId: 'deal',
    title: '',
  },
  {
    at: '2026-11-08T09:00:00.000Z',
    kind: 'record',
    text: '',
    tableId: 'tasks',
    tableName: 'Tasks',
    rowId: 'task',
    title: 'Follow up',
  },
]

describe('record activity', () => {
  beforeAll(async () => {
    provider = createInstance()
    await provider.use(initReactI18next).init({
      lng: 'en',
      resources: { en: { translation: { notes: 'Notes', activityEmpty: 'No activity yet.' } } },
    })
  })

  it('lists notes and the linked activity row', async () => {
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
            null,
            createElement(RecordActivityList, { projectId: 'project', items }),
          ),
        ),
      )
    })
    expect(host.textContent).toContain('Notes')
    expect(host.textContent).toContain('Call next week')
    expect(host.textContent).toContain('Tasks: Follow up')
    const link = host.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/projects/project/tables/tasks/rows/task')
    await act(async () => root.unmount())
    host.remove()
  })
})
