// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { Badge } from './badge'

function renderBadge(node: ReturnType<typeof createElement>) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root: Root = createRoot(host)
  act(() => {
    root.render(node)
  })
  return { host, root }
}

describe('Badge', () => {
  it('keeps the plain padding when no image is passed', async () => {
    const { host, root } = renderBadge(createElement(Badge, null, 'Synced'))
    await act(async () => {})
    const badge = host.querySelector('span')
    expect(badge?.textContent).toBe('Synced')
    expect(badge?.className).toContain('px-2')
    expect(badge?.className).toContain('py-0.5')
    expect(badge?.className).not.toContain('h-full')
    expect(badge?.querySelector('span')).toBeNull()
    await act(async () => root.unmount())
    host.remove()
  })

  it('renders an image before the text by default', async () => {
    const { host, root } = renderBadge(
      createElement(
        Badge,
        { image: createElement('img', { alt: 'mark', src: '/a.png' }) },
        'Connector',
      ),
    )
    await act(async () => {})
    const badge = host.querySelector('span')
    const mark = badge?.firstElementChild
    expect(mark?.className).toContain('rounded-full')
    expect(mark?.className).toContain('p-0')
    expect(mark?.querySelector('img')?.getAttribute('alt')).toBe('mark')
    expect(badge?.className).toContain('h-full')
    expect(badge?.className).toContain('pl-0')
    expect(mark?.className).toContain('aspect-square')
    expect(mark?.className).toContain('h-full')
    expect(badge?.className).not.toContain('py-0.5')
    expect(badge?.textContent).toContain('Connector')
    await act(async () => root.unmount())
    host.remove()
  })

  it('renders an image after the text when imageSide is right', async () => {
    const { host, root } = renderBadge(
      createElement(Badge, { image: createElement('span', null, 'U'), imageSide: 'right' }, 'user'),
    )
    await act(async () => {})
    const badge = host.querySelector('span')
    expect(badge?.lastElementChild?.textContent).toBe('U')
    expect(badge?.className).toContain('pr-0')
    await act(async () => root.unmount())
    host.remove()
  })
})
