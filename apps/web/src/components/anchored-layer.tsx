import { forwardRef, useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { placeInViewport, type ViewportAnchor } from '../lib/place-in-viewport'

type AnchoredLayerProps = {
  anchor: ViewportAnchor
  prefer?: 'above' | 'below'
  align?: 'start' | 'end'
  className?: string
  role?: string
  popover?: boolean
  tagMenu?: boolean
  zIndex?: number
  children: ReactNode
}

export const AnchoredLayer = forwardRef<HTMLDivElement, AnchoredLayerProps>(function AnchoredLayer(
  { anchor, prefer = 'below', align = 'start', className, role, popover = false, tagMenu = false, zIndex = 50, children },
  forwarded,
) {
  const localRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    localRef.current = node
    if (typeof forwarded === 'function') forwarded(node)
    else if (forwarded) forwarded.current = node
  }, [forwarded])

  useLayoutEffect(() => {
    const node = localRef.current
    if (!node) return
    const place = () => {
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      const margin = 8
      const maxHeight = Math.max(32, viewport.height - margin * 2)
      const height = Math.min(node.scrollHeight, maxHeight)
      const placed = placeInViewport(anchor, { width: node.offsetWidth, height }, viewport, { prefer, align, margin })
      setPos((current) => {
        if (current && current.top === placed.top && current.left === placed.left && current.maxHeight === maxHeight) return current
        return { top: placed.top, left: placed.left, maxHeight }
      })
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(node)
    return () => observer.disconnect()
  }, [align, anchor.bottom, anchor.left, anchor.right, anchor.top, prefer])

  return createPortal(
    <div
      ref={setRefs}
      role={role}
      className={className}
      data-popover={popover ? '' : undefined}
      data-tag-menu={tagMenu ? '' : undefined}
      style={{
        position: 'fixed',
        zIndex,
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        maxHeight: pos?.maxHeight,
        overflowY: 'auto',
        visibility: pos ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body,
  )
})
