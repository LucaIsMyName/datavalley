import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useMatch } from 'react-router'
import type { Project, TableRecord } from '@datavalley/api-client'
import { api } from '../lib/api'
import { fitCrumbs } from '../lib/fit-crumbs'

export type Crumb = { label: string; to?: string }

export function useCrumbs(): Crumb[] {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const tableMatch = useMatch('/projects/:projectId/tables/:tableId')
  const projectMatch = useMatch('/projects/:projectId')
  const projectId = tableMatch?.params.projectId ?? projectMatch?.params.projectId ?? ''
  const tableId = tableMatch?.params.tableId ?? ''
  const project = useQuery({
    queryKey: ['project', projectId],
    enabled: Boolean(projectId),
    queryFn: () => api.request<{ project: Project }>(`/projects/${projectId}`),
  })
  const tables = useQuery({
    queryKey: ['tables', projectId],
    enabled: Boolean(projectId),
    queryFn: () => api.request<{ tables: TableRecord[] }>(`/projects/${projectId}/tables`),
  })

  if (projectId) {
    const projectName = project.data?.project.name || '…'
    const projectCrumb: Crumb = { label: projectName, to: tableId ? `/projects/${projectId}` : undefined }
    const crumbs: Crumb[] = [{ label: t('projects'), to: '/projects' }, projectCrumb]
    if (tableId) {
      const tableName = tables.data?.tables.find((table) => table.id === tableId)?.name || '…'
      crumbs.push({ label: tableName })
    }
    return crumbs
  }

  const settings: Record<string, string> = {
    '/settings/profile': 'profile',
    '/settings/users': 'users',
    '/settings/api-keys': 'apiKeys',
    '/settings/audit': 'audit',
  }
  if (settings[pathname]) {
    return [
      { label: t('settings'), to: '/settings/profile' },
      { label: t(settings[pathname]) },
    ]
  }

  const singles: Record<string, string> = {
    '/': 'dashboard',
    '/projects': 'projects',
    '/recent': 'recent',
    '/favorites': 'favorites',
    '/doc': 'docs',
    '/integrations': 'integrations',
  }
  return [{ label: t(singles[pathname] ?? 'dashboard') }]
}

function CrumbRow({ crumbs, measure = false }: { crumbs: Crumb[]; measure?: boolean }) {
  return (
    <>
      {crumbs.map((crumb, index) => (
        <span key={`${crumb.label}-${index}`} className="inline-flex shrink-0 items-center gap-1">
          {index > 0 ? <ChevronRight className="size-3.5 text-muted-foreground" /> : null}
          {crumb.to && !measure ? (
            <Link to={crumb.to} className="truncate hover:underline">
              {crumb.label}
            </Link>
          ) : (
            <span className={index === crumbs.length - 1 ? 'truncate font-medium' : 'truncate'}>{crumb.label}</span>
          )}
        </span>
      ))}
    </>
  )
}

export function Breadcrumbs() {
  const { t } = useTranslation()
  const crumbs = useCrumbs()
  const slotRef = useRef<HTMLElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLButtonElement>(null)
  const [visible, setVisible] = useState<number[]>(() => crumbs.map((_, index) => index))
  const signature = crumbs.map((crumb) => `${crumb.to ?? ''}:${crumb.label}`).join('|')

  useLayoutEffect(() => {
    const slot = slotRef.current
    const measure = measureRef.current
    if (!slot || !measure) return
    const fit = () => {
      const widths = Array.from(measure.children).map((node) => (node as HTMLElement).offsetWidth)
      const menuWidth = menuRef.current?.offsetWidth ?? 32
      setVisible(fitCrumbs(widths, slot.clientWidth, menuWidth))
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(slot)
    return () => observer.disconnect()
  }, [signature])

  const hidden = crumbs.filter((_, index) => !visible.includes(index))
  const shown = visible.map((index) => crumbs[index]).filter((crumb): crumb is Crumb => Boolean(crumb))
  const currentIndex = crumbs.length - 1

  return (
    <nav ref={slotRef} aria-label={t('breadcrumbs')} className="relative flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-sm">
      <div ref={measureRef} className="pointer-events-none invisible absolute flex w-max" aria-hidden>
        <CrumbRow crumbs={crumbs} measure />
      </div>
      <button ref={menuRef} type="button" className="pointer-events-none invisible absolute inline-flex h-8 items-center px-1.5" aria-hidden tabIndex={-1}>
        …
      </button>
      {hidden.length > 0 ? (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="inline-flex h-8 shrink-0 items-center rounded-md px-1.5 hover:bg-accent" aria-label={t('breadcrumbs')}>
            …
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="z-50 min-w-40 rounded-md border border-border bg-card p-1 shadow-md" align="start" sideOffset={4}>
              {hidden.map((crumb) => (
                <DropdownMenu.Item key={`${crumb.to}-${crumb.label}`} asChild>
                  {crumb.to ? (
                    <Link to={crumb.to} className="flex min-h-9 cursor-pointer items-center rounded px-2 text-sm outline-none data-[highlighted]:bg-accent">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="flex min-h-9 items-center px-2 text-sm">{crumb.label}</span>
                  )}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : null}
      {shown.map((crumb, index) => {
        const sourceIndex = visible[index] ?? 0
        const last = sourceIndex === currentIndex
        return (
          <span key={`${crumb.label}-${sourceIndex}`} className={`inline-flex min-w-0 items-center gap-1 ${last ? 'shrink' : 'shrink-0'}`}>
            {(hidden.length > 0 || index > 0) ? <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" /> : null}
            {crumb.to ? (
              <Link to={crumb.to} className="truncate hover:underline">
                {crumb.label}
              </Link>
            ) : (
              <span className="truncate font-medium">{crumb.label}</span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
