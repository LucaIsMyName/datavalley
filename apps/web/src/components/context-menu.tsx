import { createContext, useContext, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AnchoredLayer } from './anchored-layer'

export type MenuItem = {
  id: string
  label: string
  icon: LucideIcon
  disabled?: boolean
  danger?: boolean
  onSelect: () => void
}

export type MenuHeading = {
  kind: 'heading'
  id: string
  label: string
}

export type MenuEntry = MenuItem | MenuHeading

export function isMenuHeading(entry: MenuEntry): entry is MenuHeading {
  return 'kind' in entry && entry.kind === 'heading'
}

type MenuState = { x: number; y: number; items: MenuEntry[] }

const MenuContext = createContext<((event: ReactMouseEvent, items: MenuEntry[]) => void) | null>(null)

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const items = () =>
      Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])
    items()[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(null)
        return
      }
      const list = items()
      if (list.length === 0) return
      const current = list.indexOf(document.activeElement as HTMLButtonElement)
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const next =
          event.key === 'ArrowDown'
            ? (current + 1) % list.length
            : (current - 1 + list.length) % list.length
        list[next]?.focus()
      }
      if (event.key === 'Home') {
        event.preventDefault()
        list[0]?.focus()
      }
      if (event.key === 'End') {
        event.preventDefault()
        list[list.length - 1]?.focus()
      }
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
          className="min-w-52 border border-border bg-card p-1 shadow-md"
        >
          {menu.items.map((entry, index) => {
            if (isMenuHeading(entry)) {
              const divided = menu.items.slice(0, index).some(isMenuHeading)
              return (
                <div
                  key={entry.id}
                  className={`px-2 pb-1 text-xs font-medium text-muted-foreground ${divided ? 'mt-1 border-t border-border pt-2' : 'pt-1'}`}
                >
                  {entry.label}
                </div>
              )
            }
            const Icon = entry.icon
            return (
              <button
                key={entry.id}
                type="button"
                role="menuitem"
                disabled={entry.disabled}
                className={`flex h-8 w-full items-center gap-2 px-2 text-left text-sm hover:bg-accent disabled:opacity-40 ${entry.danger ? 'text-danger' : ''}`}
                onClick={() => {
                  setMenu(null)
                  entry.onSelect()
                }}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{entry.label}</span>
              </button>
            )
          })}
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
  open: (event: ReactMouseEvent, items: MenuEntry[]) => void,
  timer: { current: number },
  origin: { current: { x: number; y: number } },
  items: MenuEntry[],
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
