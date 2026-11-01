import { createContext, useContext, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { AnchoredLayer } from './anchored-layer'

export type MenuItem = {
  id: string
  label: string
  icon: LucideIcon
  disabled?: boolean
  danger?: boolean
  dismissMenu?: boolean
  onSelect: () => void
}

export type MenuHeading = {
  kind: 'heading'
  id: string
  label: string
}

export type MenuAccordion = {
  kind: 'accordion'
  id: string
  label: string
  icon: LucideIcon
  expanded?: boolean
  items: MenuItem[]
}

export type MenuEntry = MenuItem | MenuHeading | MenuAccordion

export function isMenuHeading(entry: MenuEntry): entry is MenuHeading {
  return 'kind' in entry && entry.kind === 'heading'
}

export function isMenuAccordion(entry: MenuEntry): entry is MenuAccordion {
  return 'kind' in entry && entry.kind === 'accordion'
}

type MenuState = { x: number; y: number; items: MenuEntry[] }

type MenuContextValue = {
  open: (event: ReactMouseEvent, items: MenuEntry[]) => void
  replace: (items: MenuEntry[]) => void
}

const MenuContext = createContext<MenuContextValue | null>(null)

function menuFocusables(root: HTMLElement | null) {
  return Array.from(root?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [accordionOpen, setAccordionOpen] = useState<Record<string, boolean>>({})
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const initial: Record<string, boolean> = {}
    for (const entry of menu.items) {
      if (isMenuAccordion(entry) && entry.expanded) initial[entry.id] = true
    }
    setAccordionOpen(initial)
  }, [menu?.x, menu?.y, menu?.items])

  useEffect(() => {
    if (!menu) return
    menuFocusables(menuRef.current)[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(null)
        return
      }
      const list = menuFocusables(menuRef.current)
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

  const runItem = (entry: MenuItem) => {
    if (entry.dismissMenu !== false) setMenu(null)
    entry.onSelect()
  }

  return (
    <MenuContext.Provider
      value={{
        open: (event, items) => {
          event.preventDefault()
          setMenu({ x: event.clientX, y: event.clientY, items })
        },
        replace: (items) => setMenu((current) => (current ? { ...current, items } : null)),
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
              const divided = menu.items.slice(0, index).some((item) => isMenuHeading(item) || isMenuAccordion(item))
              return (
                <div
                  key={entry.id}
                  className={`px-2 pb-1 text-xs font-medium text-muted-foreground ${divided ? 'mt-1 border-t border-border pt-2' : 'pt-1'}`}
                >
                  {entry.label}
                </div>
              )
            }
            if (isMenuAccordion(entry)) {
              const open = accordionOpen[entry.id] ?? false
              const Chevron = open ? ChevronDown : ChevronRight
              const AccordionIcon = entry.icon
              return (
                <div key={entry.id}>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex h-8 w-full items-center gap-2 px-2 text-left text-sm hover:bg-accent"
                    aria-expanded={open}
                    onClick={() => setAccordionOpen((current) => ({ ...current, [entry.id]: !open }))}
                  >
                    <Chevron className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <AccordionIcon className="size-3.5 shrink-0" aria-hidden />
                    <span className="min-w-0 truncate">{entry.label}</span>
                  </button>
                  {open
                    ? entry.items.map((item) => {
                        const Icon = item.icon
                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="menuitem"
                            disabled={item.disabled}
                            className={`flex h-8 w-full items-center gap-2 pl-7 pr-2 text-left text-sm hover:bg-accent disabled:opacity-40 ${item.danger ? 'text-danger' : ''}`}
                            onClick={() => runItem(item)}
                          >
                            <Icon className="size-3.5 shrink-0" aria-hidden />
                            <span className="min-w-0 truncate">{item.label}</span>
                          </button>
                        )
                      })
                    : null}
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
                onClick={() => runItem(entry)}
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
  const value = useContext(MenuContext)
  if (!value) throw new Error('Context menu is unavailable')
  return value
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
