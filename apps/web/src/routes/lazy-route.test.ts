import { createElement } from 'react'
import { prerender } from 'react-dom/static'
import { describe, expect, it } from 'vitest'
import { lazyRoute } from './lazy-route'

async function markup(node: ReturnType<typeof createElement>) {
  const { prelude } = await prerender(node)
  const reader = prelude.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

describe('lazy routes', () => {
  it('loads a page only when that route renders', async () => {
    let loginLoads = 0
    let tableLoads = 0
    const Login = lazyRoute(
      async () => {
        loginLoads += 1
        return { LoginPage: function LoginPage() { return createElement('h1', null, 'Sign in') } }
      },
      'LoginPage',
      createElement('p', null, 'loading'),
    )
    const Table = lazyRoute(
      async () => {
        tableLoads += 1
        return { TablePage: function TablePage() { return createElement('h1', null, 'Grid') } }
      },
      'TablePage',
      createElement('p', null, 'loading'),
    )

    expect(loginLoads).toBe(0)
    expect(tableLoads).toBe(0)
    await expect(markup(createElement(Login))).resolves.toContain('Sign in')
    expect(loginLoads).toBe(1)
    expect(tableLoads).toBe(0)
    expect(Table.name).toBe('LazyRoute')
  })
})
