import { createContext, useContext, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'

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

  const left = menu ? Math.max(8, Math.min(menu.x, window.innerWidth - 220)) : 0
  const top = menu ? Math.max(8, Math.min(menu.y, window.innerHeight - 12 - menu.items.length * 32)) : 0

  return (
    <MenuContext.Provider
      value={(event, items) => {
        event.preventDefault()
        setMenu({ x: event.clientX, y: event.clientY, items })
      }}
    >
      {children}
      {menu ? (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-50 min-w-52 rounded-md border border-border bg-card p-1 shadow-md"
          style={{ left, top }}
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
        </div>
      ) : null}
    </MenuContext.Provider>
  )
}

export function useContextMenu() {
  const open = useContext(MenuContext)
  if (!open) throw new Error('Context menu is unavailable')
  return open
}
