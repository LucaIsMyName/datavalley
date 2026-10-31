import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { DOC_GUIDES, hashHeadingId, scrollToHeading, type TocItem } from './toc'

const DocsTocContext = createContext<{
  items: TocItem[]
  setItems: (items: TocItem[]) => void
}>({ items: [], setItems: () => undefined })

export function useDocsToc(items: TocItem[]) {
  const { setItems } = useContext(DocsTocContext)
  const key = items.map((item) => `${item.id}:${item.title}`).join('|')
  useEffect(() => {
    setItems(items)
    return () => setItems([])
  }, [key, setItems])
}

function GuideNav({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const { t } = useTranslation('docs')
  return (
    <nav className={className}>
      {DOC_GUIDES.map((guide) => (
        <NavLink
          key={guide.to}
          to={guide.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex h-9 items-center justify-center px-2 text-sm md:justify-start ${isActive ? 'bg-accent font-medium' : 'hover:bg-accent'}`
          }
        >
          {t(guide.key)}
        </NavLink>
      ))}
    </nav>
  )
}

function TocLinks({ items, className, onNavigate }: { items: TocItem[]; className?: string; onNavigate?: () => void }) {
  return (
    <nav className={className}>
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="flex min-h-8 items-center px-2 text-sm text-muted-foreground hover:bg-accent"
          onClick={(event) => {
            event.preventDefault()
            scrollToHeading(item.id)
            onNavigate?.()
          }}
        >
          {item.title}
        </a>
      ))}
    </nav>
  )
}

function MobileToc({ items }: { items: TocItem[] }) {
  const { t } = useTranslation('docs')
  const [open, setOpen] = useState(false)
  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger
        className="inline-flex h-9 shrink-0 items-center px-3 text-sm hover:bg-accent disabled:opacity-50"
        disabled={items.length === 0}
      >
        {t('onThisPage')}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="z-50 min-w-44 border border-border bg-card p-1 shadow-md" align="end" sideOffset={4}>
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.id}
              className="flex min-h-9 cursor-pointer items-center px-2 text-sm outline-none data-[highlighted]:bg-accent"
              onSelect={() => scrollToHeading(item.id)}
            >
              {item.title}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function DocsChrome({ children }: { children: ReactNode }) {
  const { t } = useTranslation('docs')
  const { hash, pathname } = useLocation()
  const [items, setItems] = useState<TocItem[]>([])
  const value = useMemo(() => ({ items, setItems }), [items])

  useLayoutEffect(() => {
    const id = hashHeadingId(hash)
    if (!id) return
    const frame = requestAnimationFrame(() => scrollToHeading(id))
    return () => cancelAnimationFrame(frame)
  }, [hash, pathname, items])

  return (
    <DocsTocContext.Provider value={value}>
      <div className="flex min-h-0 min-w-0 flex-1">
        <aside className="hidden w-52 shrink-0 flex-col overflow-y-auto border-r border-border bg-card p-3 md:flex">
          <GuideNav className="flex flex-col gap-1" />
          <p className="mt-4 pt-4 border-t border-border px-2 text-xs opacity-70 font-medium text-muted-foreground">{t('onThisPage')}</p>
          <TocLinks items={items} className="mt-1 flex flex-col gap-1" />
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2 pb-[max(0px,env(safe-area-inset-bottom))] md:hidden">
            <GuideNav className="grid min-w-0 flex-1 grid-cols-3" />
            <MobileToc items={items} />
          </div>
          {children}
        </div>
      </div>
    </DocsTocContext.Provider>
  )
}

export function DocsLayout() {
  return (
    <DocsChrome>
      <Outlet />
    </DocsChrome>
  )
}

export function DocsIndexRedirect() {
  const { hash } = useLocation()
  return <Navigate to={{ pathname: '/doc/use', hash }} replace />
}
