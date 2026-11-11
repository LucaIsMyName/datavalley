// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { NotificationsBell, unreadNotificationCount } from './app-shell'

let provider: ReturnType<typeof createInstance>
let root: Root | undefined
let host: HTMLDivElement | undefined

describe('notification bell', () => {
  beforeAll(async () => {
    provider = createInstance()
    await provider.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      defaultNS: 'common',
      resources: {
        en: {
          common: {
            notifications: 'Notifications',
            notificationsUnread: 'Notifications, {{count}} unread',
            noNotifications: 'No notifications',
            loading: 'Loading',
          },
        },
      },
      interpolation: { escapeValue: false },
    })
  })

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = undefined
    host = undefined
  })

  it('counts only items that have not been read', () => {
    expect(unreadNotificationCount([])).toBe(0)
    expect(
      unreadNotificationCount([
        { readAt: '2026-11-01T00:00:00.000Z' },
        { readAt: '2026-11-02T00:00:00.000Z' },
      ]),
    ).toBe(0)
    expect(
      unreadNotificationCount([
        { readAt: null },
        { readAt: '2026-11-01T00:00:00.000Z' },
        { readAt: null },
      ]),
    ).toBe(2)
  })

  function render(items: { id: string; title: string; readAt: string | null }[]) {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => {
      root?.render(
        createElement(
          I18nextProvider,
          { i18n: provider },
          createElement(
            MemoryRouter,
            null,
            createElement(NotificationsBell, {
              open: false,
              onOpen: () => undefined,
              items,
              loading: false,
              onRead: () => undefined,
            }),
          ),
        ),
      )
    })
  }

  it('shows the unread count on the bell', () => {
    render([
      { id: '1', title: 'Assigned', readAt: null },
      { id: '2', title: 'Sync failed', readAt: null },
      { id: '3', title: 'Done', readAt: '2026-11-01T00:00:00.000Z' },
    ])
    const button = host?.querySelector('button')
    expect(button?.getAttribute('aria-label')).toBe('Notifications, 2 unread')
    expect(button?.textContent).toContain('2')
  })

  it('hides the badge when every notification is read', () => {
    render([{ id: '1', title: 'Done', readAt: '2026-11-01T00:00:00.000Z' }])
    const button = host?.querySelector('button')
    expect(button?.getAttribute('aria-label')).toBe('Notifications')
    expect(button?.textContent).not.toContain('1')
  })
})
