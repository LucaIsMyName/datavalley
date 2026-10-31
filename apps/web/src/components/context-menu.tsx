import { createContext, useContext, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { AnchoredLayer } from './anchored-layer'

export type MenuItem = {
  id: string
  label: string
  disabled?: boolean
  danger?: boolean
  onSelect: () => void
}

type MenuState = { x: number; y: number; items: MenuItem[] }

const MenuContext = createContext<((event: ReactMouseEvent, items: MenuItem[]) => void) | null>(null)

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    const onPointer = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      setMenu(null)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [menu])

  return (
    <MenuContext.Provider
      value={(event, items) => {
        event.preventDefault()
        setMenu({ x: event.clientX, y: event.clientY, items })
      }}
    >
      {children}
      {menu ? (
        <AnchoredLayer
          ref={menuRef}
          role="menu"
          prefer="below"
          align="start"
          anchor={{ left: menu.x, top: menu.y, right: menu.x, bottom: menu.y }}
          className="min-w-52 rounded-md border border-border bg-card p-1 shadow-md"
        >
          {menu.items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`flex h-8 w-full items-center rounded px-2 text-left text-sm hover:bg-accent disabled:opacity-40 ${item.danger ? 'text-danger' : ''}`}
              onClick={() => {
                setMenu(null)
                item.onSelect()
              }}
            >
              {item.label}
            </button>
          ))}
        </AnchoredLayer>
      ) : null}
    </MenuContext.Provider>
  )
}

export function useContextMenu() {
  const open = useContext(MenuContext)
  if (!open) throw new Error('Context menu is unavailable')
  return open
}

export function pressMenuProps(
  open: (event: ReactMouseEvent, items: MenuItem[]) => void,
  timer: { current: number },
  origin: { current: { x: number; y: number } },
  items: MenuItem[],
) {
  const clear = () => window.clearTimeout(timer.current)
  return {
    onContextMenu: (event: ReactMouseEvent) => open(event, items),
    onPointerDown: (event: React.PointerEvent) => {
      if (event.pointerType === 'mouse') return
      origin.current = { x: event.clientX, y: event.clientY }
      clear()
      const point = { x: event.clientX, y: event.clientY }
      timer.current = window.setTimeout(() => {
        open({ preventDefault() {}, clientX: point.x, clientY: point.y } as ReactMouseEvent, items)
      }, 500)
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 10) clear()
    },
    onPointerUp: clear,
    onPointerCancel: clear,
  }
}
