// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { Outlet, RouterProvider, createMemoryRouter, type RouteObject } from 'react-router'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { router } from './router'
import { RouteErrorPage, routeErrorMessage } from './route-error'

function Boom(): ReactNode {
  throw new Error('grid blew up')
}

function Shell() {
  return createElement('div', null, createElement('nav', null, 'Shell'), createElement(Outlet))
}

function RootChrome() {
  return createElement('div', null, 'root-chrome', createElement(Outlet))
}

describe('router error elements', () => {
  it('catches shell page throws inside the app shell and other throws at the root', () => {
    const root = router.routes[0]
    expect(root?.errorElement).toBeTruthy()
    const requireAuth = root?.children?.find((route) => !route.path && route.children)
    const shell = requireAuth?.children?.[0]
    const boundary = shell?.children?.[0]
    expect(boundary?.path).toBeUndefined()
    expect(boundary?.errorElement).toBeTruthy()
    expect(boundary?.children?.some((route) => route.path === '/')).toBe(true)
    expect(boundary?.children?.some((route) => route.path === '/projects/:projectId')).toBe(true)
    expect(root?.children?.some((route) => route.path === '/login')).toBe(true)
  })
})

describe('routeErrorMessage', () => {
  it('reads an Error message', () => {
    expect(routeErrorMessage(new Error('grid blew up'))).toBe('grid blew up')
  })

  it('reads a route error response body, then status text', () => {
    expect(
      routeErrorMessage({
        status: 404,
        statusText: 'Not Found',
        data: 'Missing table',
        internal: true,
      }),
    ).toBe('Missing table')
    expect(
      routeErrorMessage({
        status: 500,
        statusText: 'Server Error',
        data: { message: 'Database down' },
        internal: true,
      }),
    ).toBe('Database down')
    expect(
      routeErrorMessage({ status: 403, statusText: 'Forbidden', data: '', internal: true }),
    ).toBe('Forbidden')
  })

  it('returns an empty string for unknown values', () => {
    expect(routeErrorMessage(null)).toBe('')
    expect(routeErrorMessage('nope')).toBe('')
    expect(routeErrorMessage(new Error(''))).toBe('')
  })
})

describe('RouteErrorPage', () => {
  let provider: ReturnType<typeof createInstance>

  beforeAll(async () => {
    provider = createInstance()
    await provider.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      defaultNS: 'common',
      resources: { en: { common: { error: 'Something went wrong', tryAgain: 'Try again' } } },
      interpolation: { escapeValue: false },
    })
  })

  async function renderRoutes(routes: RouteObject[], initialEntry: string) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await act(async () => {
        root.render(
          createElement(
            I18nextProvider,
            { i18n: provider },
            createElement(RouterProvider, {
              router: createMemoryRouter(routes, { initialEntries: [initialEntry] }),
            }),
          ),
        )
      })
      return host.innerHTML
    } finally {
      await act(async () => root.unmount())
      host.remove()
      errors.mockRestore()
    }
  }

  it('keeps the shell when a page under the pathless boundary throws', async () => {
    const html = await renderRoutes(
      [
        {
          path: '/',
          element: createElement(Shell),
          children: [
            {
              errorElement: createElement(RouteErrorPage),
              children: [{ index: true, element: createElement(Boom) }],
            },
          ],
        },
      ],
      '/',
    )
    expect(html).toContain('Shell')
    expect(html).toContain('grid blew up')
    expect(html).toContain('Try again')
  })

  it('renders the root error page when a route outside the shell throws', async () => {
    const html = await renderRoutes(
      [
        {
          path: '/',
          element: createElement(RootChrome),
          errorElement: createElement(RouteErrorPage),
          children: [{ path: 'login', element: createElement(Boom) }],
        },
      ],
      '/login',
    )
    expect(html).toContain('grid blew up')
    expect(html).toContain('Try again')
    expect(html).not.toContain('root-chrome')
  })
})
