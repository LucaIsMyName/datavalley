// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { User } from '@datavalley/api-client'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { api } from '../../lib/api'
import { useSession } from '../../stores/session'
import { ProfilePage } from './profile-page'

let provider: ReturnType<typeof createInstance>
let root: Root | undefined
let host: HTMLDivElement | undefined

const user: User = {
  id: 'user-1',
  username: 'ada',
  email: 'ada@example.com',
  role: 'admin',
  disabled: false,
  mustChangePassword: false,
  locale: 'en',
  timezone: 'UTC',
  theme: 'system',
  createdAt: '2026-01-01T00:00:00.000Z',
  totpEnabled: false,
}

function buttonNamed(name: string) {
  return [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === name)
}

describe('profile two-factor setup', () => {
  beforeAll(async () => {
    provider = createInstance()
    await provider.use(initReactI18next).init({
      lng: 'en',
      resources: {
        en: {
          translation: {
            profile: 'Profile',
            language: 'Language',
            theme: 'Theme',
            system: 'System',
            light: 'Light',
            dark: 'Dark',
            timezone: 'Timezone',
            totp: 'Two-factor authentication',
            enroll: 'Set up authenticator',
            totpSecret: 'Secret',
            totpUrl: 'Authenticator URL',
            copy: 'Copy',
            close: 'Close',
            totpCode: 'Authenticator code',
            totpConfirm: 'Turn on authenticator',
            totpEnabled: 'Authenticator is on',
            totpRecovery: 'Recovery codes',
            totpRecoveryHint: 'Save these codes.',
            disable: 'Disable',
            cancel: 'Cancel',
            totpDisableWarning: 'Password only.',
            error: 'Error',
          },
        },
      },
    })
  })

  afterEach(() => {
    act(() => root?.unmount())
    host?.remove()
    root = undefined
    host = undefined
    vi.restoreAllMocks()
    useSession.setState({ user: null, ready: false })
  })

  it('confirms an authenticator code and can turn it off', async () => {
    vi.spyOn(api, 'request').mockImplementation(async (path) => {
      if (path === '/totp/enroll') return { secret: 'SECRET32', url: 'otpauth://totp/example' }
      if (path === '/totp/confirm') return { recoveryCodes: ['code-1', 'code-2'] }
      if (path === '/totp/disable') return { ok: true }
      throw new Error(String(path))
    })
    useSession.setState({ user, ready: true })
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
      root?.render(
        createElement(
          I18nextProvider,
          { i18n: provider },
          createElement(
            QueryClientProvider,
            { client: queryClient },
            createElement(MemoryRouter, { initialEntries: ['/settings/profile'] }, createElement(ProfilePage)),
          ),
        ),
      )
    })

    await act(async () => {
      buttonNamed('Set up authenticator')?.click()
    })
    expect(document.body.textContent).toContain('SECRET32')

    const code = document.querySelector<HTMLInputElement>('#totp-code')
    expect(code).toBeTruthy()
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(code, '123456')
      code?.dispatchEvent(new Event('input', { bubbles: true }))
      code?.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => {
      buttonNamed('Turn on authenticator')?.click()
    })
    expect(document.body.textContent).toContain('code-1')
    expect(useSession.getState().user?.totpEnabled).toBe(true)

    await act(async () => {
      buttonNamed('Close')?.click()
    })
    expect(document.body.textContent).toContain('Authenticator is on')

    await act(async () => {
      buttonNamed('Disable')?.click()
    })
    const disableButtons = [...document.querySelectorAll('button')].filter(
      (item) => item.textContent?.trim() === 'Disable',
    )
    await act(async () => {
      disableButtons[disableButtons.length - 1]?.click()
    })
    expect(useSession.getState().user?.totpEnabled).toBe(false)
    expect(document.body.textContent).toContain('Set up authenticator')
  })
})
