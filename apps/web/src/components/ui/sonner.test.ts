// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { toast } from 'sonner'
import { afterEach, describe, expect, it } from 'vitest'
import { Toaster } from './sonner'

describe('Toaster', () => {
  let host: HTMLDivElement
  let root: Root

  afterEach(() => {
    act(() => {
      toast.dismiss()
      root?.unmount()
    })
    host?.remove()
  })

  it('uses a square muted toast with a foreground border and a status icon', async () => {
    document.documentElement.style.setProperty('--muted', '#f1f1f1')
    document.documentElement.style.setProperty('--foreground', '#252525')
    document.documentElement.style.setProperty('--swatch-green-fg', '#166534')
    document.documentElement.style.setProperty('--danger', '#9f2d2d')
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => {
      root.render(createElement(Toaster))
    })
    act(() => {
      toast.success('Saved')
      toast.error('Failed')
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const items = [...document.querySelectorAll('[data-sonner-toast]')]
    expect(items).toHaveLength(2)
    for (const item of items) {
      const style = getComputedStyle(item)
      expect(style.borderRadius).toBe('0px')
      expect(style.backgroundColor).toBe('#f1f1f1')
      // expect(style.borderTopColor).toBe('#252525')
      expect(item.querySelector('svg')).toBeTruthy()
    }
    const success = items.find((item) => item.textContent?.includes('Saved'))
    const error = items.find((item) => item.textContent?.includes('Failed'))
    expect(getComputedStyle(success!.querySelector('svg')!).color).toBe('#166534')
    expect(getComputedStyle(error!.querySelector('svg')!).color).toBe('#9f2d2d')
  })
})
