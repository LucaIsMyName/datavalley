import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Bookmark, Copy, Download, MoreHorizontal, Search, Trash2, Upload } from 'lucide-react'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui/button'

export type TableToolbarView = {
  id: string
  name: string
  apply: () => void
}

export type TableToolbarActions = {
  find: (anchor: HTMLElement) => void
  exportCsv: () => void
  importCsv: () => void
  views: TableToolbarView[]
  saveView: (anchor: HTMLElement) => void
  duplicateTable: () => void
  deleteTable: () => void
}

const TableToolbarContext = createContext<{
  actions: TableToolbarActions | null
  setActions: (actions: TableToolbarActions | null) => void
} | null>(null)

export function TableToolbarProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<TableToolbarActions | null>(null)
  const value = useMemo(() => ({ actions, setActions }), [actions])
  return <TableToolbarContext.Provider value={value}>{children}</TableToolbarContext.Provider>
}

export function useRegisterTableToolbar(actions: TableToolbarActions | null) {
  const ctx = useContext(TableToolbarContext)
  const setActions = ctx?.setActions
  useEffect(() => {
    if (!setActions) return
    setActions(actions)
    return () => setActions(null)
  }, [actions, setActions])
}

export function TableToolbarRow() {
  const { t } = useTranslation()
  const ctx = useContext(TableToolbarContext)
  const actions = ctx?.actions
  const viewsTriggerRef = useRef<HTMLButtonElement>(null)
  if (!actions) return <div className="h-9 shrink-0" aria-hidden />

  return (
    <div className="flex h-9 shrink-0 items-center gap-0.5 overflow-x-auto">
      <Button
        type="button"
        variant="ghost"
        className="size-9 shrink-0 px-0"
        aria-label={t('find')}
        title={t('find')}
        onClick={(event) => actions.find(event.currentTarget)}
      >
        <Search className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="size-9 shrink-0 px-0"
        aria-label={t('export')}
        title={t('export')}
        onClick={() => actions.exportCsv()}
      >
        <Download className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="size-9 shrink-0 px-0"
        aria-label={t('import')}
        title={t('import')}
        onClick={() => actions.importCsv()}
      >
        <Upload className="size-4" />
      </Button>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          ref={viewsTriggerRef}
          type="button"
          className="inline-flex size-9 shrink-0 items-center justify-center hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label={t('views')}
          title={t('views')}
        >
          <Bookmark className="size-4" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="z-50 min-w-44 border border-border bg-card p-1 shadow-md" align="start" sideOffset={4}>
            {actions.views.length === 0 ? null : (
              actions.views.map((view) => (
                <DropdownMenu.Item
                  key={view.id}
                  className="flex min-h-9 cursor-pointer items-center px-2 text-sm outline-none data-[highlighted]:bg-accent"
                  onSelect={() => view.apply()}
                >
                  {view.name}
                </DropdownMenu.Item>
              ))
            )}
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item
              className="flex min-h-9 cursor-pointer items-center px-2 text-sm outline-none data-[highlighted]:bg-accent"
              onSelect={() => {
                const el = viewsTriggerRef.current
                if (el) actions.saveView(el)
              }}
            >
              {t('saveView')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="size-9 shrink-0 px-0"
            aria-label={t('menu')}
            title={t('menu')}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="z-50 min-w-44 border border-border bg-card p-1 shadow-md" align="start" sideOffset={4}>
            <DropdownMenu.Item
              className="flex min-h-9 cursor-pointer items-center gap-2 px-2 text-sm outline-none data-[highlighted]:bg-accent"
              onSelect={() => actions.duplicateTable()}
            >
              <Copy className="size-3.5 shrink-0" aria-hidden />
              {t('duplicateTable')}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="flex min-h-9 cursor-pointer items-center gap-2 px-2 text-sm text-danger outline-none data-[highlighted]:bg-accent"
              onSelect={() => actions.deleteTable()}
            >
              <Trash2 className="size-3.5 shrink-0" aria-hidden />
              {t('delete')}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}

export function viewportAnchorFrom(el: HTMLElement) {
  const rect = el.getBoundingClientRect()
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}
