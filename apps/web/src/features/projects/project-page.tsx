import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, GripVertical, Info, Plus, Star, Trash2, Users } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, Outlet, useLocation, useMatch, useNavigate, useParams } from 'react-router'
import type { Project, TableRecord } from '@datavalley/api-client'
import { IconButton } from '../../components/icon-button'
import { QuietInput } from '../../components/quiet-input'
import { pressMenuProps, useContextMenu } from '../../components/context-menu'
import { Badge } from '../../components/ui/badge'
import { ConfirmDialog } from '../../components/confirm-dialog'
import { EmptyState, ErrorState, LoadingBlock, Page } from '../../components/states'
import { patchCachedTable } from '../tables/cache'
import { pushCommand } from '../tables/history'
import { tabDropEdge } from '../tables/drop-place'
import { moveTab } from '../tables/table-tabs'
import { openRegisteredTableMenu } from '../tables/table-menu'
import { deleteTableInProject } from '../tables/table-delete'
import { TableToolbarProvider, TableToolbarRow } from '../tables/table-toolbar'
import { api } from '../../lib/api'
import { sync } from '../../lib/sync'
import type { SavedHit } from '../home/pages'
import { ProjectDescription } from './projects-page'
import { ProjectMembersDialog } from './project-members-dialog'
import { CreateTableDialog } from './create-table-dialog'

function rememberTableName(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string,
  tableId: string,
  name: string,
) {
  queryClient.setQueryData(
    ['tables', projectId],
    (current: { tables: TableRecord[] } | undefined) => {
      if (!current) return current
      return {
        tables: current.tables.map((table) => (table.id === tableId ? { ...table, name } : table)),
      }
    },
  )
  patchCachedTable(queryClient, tableId, (current) => ({ ...current, name }))
}

export function ProjectPage() {
  const { projectId = '' } = useParams()
  const tableMatch = useMatch('/projects/:projectId/tables/:tableId')
  const tableId = tableMatch?.params.tableId ?? ''
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { open: openMenu } = useContextMenu()
  const queryClient = useQueryClient()
  const nameRef = useRef<HTMLInputElement>(null)
  const pressTimer = useRef(0)
  const pressOrigin = useRef({ x: 0, y: 0 })
  const tabFrom = useRef<string | null>(null)
  const [tabOver, setTabOver] = useState<string | null>(null)
  const [membersOpen, setMembersOpen] = useState(false)
  const [descriptionOpen, setDescriptionOpen] = useState(false)
  const [remove, setRemove] = useState<TableRecord | null>(null)
  const [creatingTable, setCreatingTable] = useState(false)
  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.request<{ project: Project }>(`/projects/${projectId}`),
  })
  const tables = useQuery({
    queryKey: ['tables', projectId],
    queryFn: () => api.request<{ tables: TableRecord[] }>(`/projects/${projectId}/tables`),
  })
  const savedFavorites = useQuery({
    queryKey: ['favorites'],
    queryFn: () => api.request<{ favorites: SavedHit[] }>('/favorites'),
  })
  const projectFavorited =
    savedFavorites.data?.favorites.some(
      (item) => item.resourceType === 'project' && item.resourceId === projectId,
    ) ?? false
  const record = project.data?.project
  const tableRows = tables.data?.tables ?? []
  const active = tableRows.find((table) => table.id === tableId)

  useEffect(() => {
    const state = location.state as { focusName?: boolean } | null
    if (!state?.focusName || !active) return
    nameRef.current?.select()
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
  }, [active, location.pathname, location.search, location.state, navigate])

  if (project.isLoading || tables.isLoading)
    return (
      <Page title={t('projects')}>
        <LoadingBlock />
      </Page>
    )
  if (project.isError)
    return (
      <Page title={t('projects')}>
        <ErrorState message={(project.error as Error).message} />
      </Page>
    )
  if (tables.isError)
    return (
      <Page title={t('projects')}>
        <ErrorState message={(tables.error as Error).message} />
      </Page>
    )
  if (!tableId && tableRows.length > 0)
    return <Navigate to={`/projects/${projectId}/tables/${tableRows[0].id}`} replace />

  function scheduleProjectName(next: string) {
    const before = record?.name ?? ''
    sync.edit(`project:${projectId}:name`, {
      draft: next,
      delay: 300,
      apply: () => undefined,
      commit: async (draft) => {
        const trimmed = draft.trim()
        if (!trimmed || trimmed === before)
          return (
            record ?? {
              id: projectId,
              name: before,
              description: '',
              icon: 'FolderKanban',
              archivedAt: null,
              organizationId: '',
            }
          )
        const result = await api.request<{ project: Project }>(`/projects/${projectId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: trimmed }),
        })
        return result.project
      },
      accept: (saved) => {
        queryClient.setQueryData(['project', projectId], { project: saved })
        void queryClient.invalidateQueries({ queryKey: ['projects'] })
      },
      rollback: () => {
        queryClient.setQueryData(['project', projectId], project.data)
      },
    })
  }

  function scheduleTableName(table: TableRecord, next: string) {
    const before = table.name
    sync.edit(`table:${table.id}:name`, {
      draft: next,
      delay: 300,
      apply: () => undefined,
      commit: async (draft) => {
        const trimmed = draft.trim()
        if (!trimmed || trimmed === before) return { name: before }
        await api.request(`/tables/${table.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: trimmed }),
        })
        return { name: trimmed }
      },
      accept: (saved) => {
        rememberTableName(queryClient, projectId, table.id, saved.name)
        if (saved.name !== before)
          pushCommand(table.id, { kind: 'table-renamed', before, after: saved.name })
      },
      rollback: () => rememberTableName(queryClient, projectId, table.id, before),
    })
  }

  async function saveIcon(kind: 'project' | 'table', id: string, icon: string) {
    if (kind === 'project') {
      const result = await api.request<{ project: Project }>(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ icon }),
      })
      queryClient.setQueryData(['project', projectId], result)
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      return
    }
    const result = await api.request<{ table: TableRecord }>(`/tables/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ icon }),
    })
    queryClient.setQueryData(
      ['tables', projectId],
      (current: { tables: TableRecord[] } | undefined) => {
        if (!current) return current
        return {
          tables: current.tables.map((table) =>
            table.id === id ? { ...table, icon: result.table.icon } : table,
          ),
        }
      },
    )
    patchCachedTable(queryClient, id, (current) => ({ ...current, icon: result.table.icon }))
  }

  async function reorderTabs(fromId: string, toId: string) {
    const current = tableRows
    const next = moveTab(current, fromId, toId)
    if (next === current) return
    queryClient.setQueryData(['tables', projectId], { tables: next })
    try {
      await api.request(`/projects/${projectId}/tables/order`, {
        method: 'PUT',
        body: JSON.stringify({ tableIds: next.map((table) => table.id) }),
      })
    } catch {
      queryClient.setQueryData(['tables', projectId], { tables: current })
    }
  }

  async function openCreatedTable(table: TableRecord, focusName: boolean) {
    await queryClient.invalidateQueries({ queryKey: ['tables', projectId] })
    navigate(
      `/projects/${projectId}/tables/${table.id}`,
      focusName ? { state: { focusName: true } } : undefined,
    )
  }

  const favoriteBody = JSON.stringify({ resourceType: 'project', resourceId: projectId })

  function toggleProjectFavorite() {
    void api
      .request('/favorites', { method: projectFavorited ? 'DELETE' : 'POST', body: favoriteBody })
      .then(() => queryClient.invalidateQueries({ queryKey: ['favorites'] }))
  }

  const favoriteProject = [
    {
      id: 'favorite',
      label: t('addToFavorites'),
      icon: Star,
      onSelect: () => {
        void api
          .request('/favorites', { method: 'POST', body: favoriteBody })
          .then(() => queryClient.invalidateQueries({ queryKey: ['favorites'] }))
      },
    },
  ]

  return (
    <TableToolbarProvider>
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 flex-col gap-3 px-4 pt-4 md:px-6 md:pt-6">
          <div className="flex min-h-10 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div
              className="flex min-w-0 items-center gap-2"
              {...pressMenuProps(openMenu, pressTimer, pressOrigin, favoriteProject)}
            >
              <IconButton
                name={record?.icon ?? 'FolderKanban'}
                onChange={(icon) => void saveIcon('project', projectId, icon)}
              />
              <h1 aria-label={record?.name ?? t('projects')} className="min-w-0">
                <QuietInput
                  fit
                  fitMaxClass="max-w-[min(28rem,calc(100vw-9rem))]"
                  label={t('name')}
                  className="h-8 bg-transparent px-0 text-xl font-semibold outline-none"
                  value={record?.name ?? ''}
                  onDraft={scheduleProjectName}
                  onFlush={() => void sync.flush(`project:${projectId}:name`)}
                  onCancel={() => sync.cancel(`project:${projectId}:name`)}
                />
              </h1>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={projectFavorited ? t('removeFromFavorites') : t('addToFavorites')}
                aria-pressed={projectFavorited}
                className="inline-flex size-8 shrink-0 items-center justify-center hover:bg-accent"
                onClick={toggleProjectFavorite}
              >
                <Star className={projectFavorited ? 'size-4 fill-current' : 'size-4'} />
              </button>
              <button
                type="button"
                aria-label={t('members')}
                className="inline-flex size-8 shrink-0 items-center justify-center hover:bg-accent"
                onClick={() => setMembersOpen(true)}
              >
                <Users className="size-4" />
              </button>
              <button
                type="button"
                aria-label={t('info')}
                className="inline-flex size-8 shrink-0 items-center justify-center hover:bg-accent"
                onClick={() => setDescriptionOpen(true)}
              >
                <Info className="size-4" />
              </button>
            </div>
          </div>
          <div className="flex h-11 items-end gap-1 overflow-x-auto">
            {tableRows.map((table) => {
              const current = table.id === tableId
              const tabEdge =
                tabOver === table.id
                  ? tabDropEdge(
                      tableRows.map((item) => item.id),
                      tabFrom.current ?? '',
                      table.id,
                    )
                  : null
              const items = [
                {
                  id: 'open',
                  label: t('open'),
                  icon: FolderOpen,
                  onSelect: () => navigate(`/projects/${projectId}/tables/${table.id}`),
                },
                {
                  id: 'favorite',
                  label: t('addToFavorites'),
                  icon: Star,
                  onSelect: () => {
                    void api
                      .request('/favorites', {
                        method: 'POST',
                        body: JSON.stringify({ resourceType: 'table', resourceId: table.id }),
                      })
                      .then(() => queryClient.invalidateQueries({ queryKey: ['favorites'] }))
                  },
                },
                {
                  id: 'delete',
                  label: t('delete'),
                  icon: Trash2,
                  danger: true,
                  onSelect: () => setRemove(table),
                },
              ]
              return (
                <div
                  key={table.id}
                  draggable={!current}
                  onDragStart={(event) => {
                    tabFrom.current = table.id
                    event.dataTransfer.setData('text/plain', `table:${table.id}`)
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => {
                    tabFrom.current = null
                    setTabOver(null)
                  }}
                  onDragOver={(event) => {
                    const from = tabFrom.current
                    if (!from) return
                    event.preventDefault()
                    const next = tabDropEdge(
                      tableRows.map((item) => item.id),
                      from,
                      table.id,
                    )
                      ? table.id
                      : null
                    setTabOver((currentOver) => (currentOver === next ? currentOver : next))
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const fromId = event.dataTransfer.getData('text/plain').replace(/^table:/, '')
                    tabFrom.current = null
                    setTabOver(null)
                    if (fromId) void reorderTabs(fromId, table.id)
                  }}
                  className={`relative flex h-10 shrink-0 items-center gap-1 border border-b-0 px-1 pr-4 ${current ? 'border-border bg-card' : 'border-transparent'}`}
                  {...(current
                    ? {
                        onContextMenu: (event: ReactMouseEvent) => openRegisteredTableMenu(event),
                        onPointerDown: (event: ReactPointerEvent) => {
                          if (event.pointerType === 'mouse') return
                          const point = { x: event.clientX, y: event.clientY }
                          pressOrigin.current = point
                          window.clearTimeout(pressTimer.current)
                          pressTimer.current = window.setTimeout(() => {
                            openRegisteredTableMenu({
                              preventDefault() {},
                              clientX: point.x,
                              clientY: point.y,
                            } as ReactMouseEvent)
                          }, 500)
                        },
                        onPointerMove: (event: ReactPointerEvent) => {
                          if (
                            Math.hypot(
                              event.clientX - pressOrigin.current.x,
                              event.clientY - pressOrigin.current.y,
                            ) > 10
                          ) {
                            window.clearTimeout(pressTimer.current)
                          }
                        },
                        onPointerUp: () => window.clearTimeout(pressTimer.current),
                        onPointerCancel: () => window.clearTimeout(pressTimer.current),
                      }
                    : pressMenuProps(openMenu, pressTimer, pressOrigin, items))}
                >
                  <span
                    role="button"
                    tabIndex={-1}
                    draggable
                    aria-label={t('reorder')}
                    className="inline-flex shrink-0 cursor-grab text-muted-foreground"
                    onMouseDown={(event) => event.stopPropagation()}
                    onDragStart={(event) => {
                      event.stopPropagation()
                      tabFrom.current = table.id
                      event.dataTransfer.setData('text/plain', `table:${table.id}`)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => {
                      tabFrom.current = null
                      setTabOver(null)
                    }}
                  >
                    <GripVertical className="size-3.5" />
                  </span>
                  {tabEdge ? (
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-primary ${tabEdge === 'after' ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2'}`}
                    />
                  ) : null}
                  <IconButton
                    name={table.icon}
                    onChange={(icon) => void saveIcon('table', table.id, icon)}
                  />
                  {current ? (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <QuietInput
                        fit
                        inputRef={nameRef}
                        label={t('tableName')}
                        className="h-8 bg-transparent px-0 text-sm font-medium outline-none"
                        value={table.name}
                        onDraft={(next) => scheduleTableName(table, next)}
                        onFlush={() => void sync.flush(`table:${table.id}:name`)}
                        onCancel={() => sync.cancel(`table:${table.id}:name`)}
                      />
                      {table.mirrorOfTableId ? (
                        <Badge className="shrink-0 normal-case" color="slate">
                          {t('syncedBadge')}
                        </Badge>
                      ) : null}
                    </div>
                  ) : (
                    <Link
                      to={`/projects/${projectId}/tables/${table.id}`}
                      className="inline-flex max-w-[min(20rem,calc(100vw-12rem))] min-w-0 items-center gap-1.5 text-sm font-medium"
                    >
                      <span className="truncate">{table.name}</span>
                      {table.mirrorOfTableId ? (
                        <Badge className="shrink-0 normal-case" color="slate">
                          {t('syncedBadge')}
                        </Badge>
                      ) : null}
                    </Link>
                  )}
                </div>
              )
            })}
            <button
              type="button"
              className="flex h-10 shrink-0 items-center gap-1 whitespace-nowrap border border-transparent text-sm font-medium"
              onClick={() => setCreatingTable(true)}
            >
              <Plus className="size-4" />
              {t('newTable')}
            </button>
          </div>
        </header>
        {tableId && tableRows.length > 0 ? (
          <div className="flex shrink-0 mx-4 md:mx-6 border-t border-l border-r border-border">
            <TableToolbarRow />
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col">
          {tableRows.length === 0 ? (
            <div className="p-4 md:p-6">
              <EmptyState title={t('emptyTables')} body={t('emptyTablesBody')} />
            </div>
          ) : (
            <Outlet />
          )}
        </div>
        <Dialog.Root
          open={descriptionOpen}
          onOpenChange={(open) => {
            if (!open) void sync.flush(`project:${projectId}:description`)
            setDescriptionOpen(open)
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20" />
            <Dialog.Content className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col gap-3 border-l border-border bg-card p-4 shadow-lg">
              <Dialog.Title className="text-lg font-semibold">{t('description')}</Dialog.Title>
              <Dialog.Description className="sr-only">{t('description')}</Dialog.Description>
              <ProjectDescription projectId={projectId} value={record?.description ?? ''} />
              <Dialog.Close className="self-end border border-border px-3 py-1.5 text-sm">
                {t('close')}
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <ProjectMembersDialog
          projectId={projectId}
          open={membersOpen}
          onOpenChange={setMembersOpen}
        />
        <CreateTableDialog
          projectId={projectId}
          open={creatingTable}
          onOpenChange={setCreatingTable}
          onCreated={openCreatedTable}
        />
        <ConfirmDialog
          open={Boolean(remove)}
          title={t('deleteTableTitle')}
          body={t('deleteTableWarning', { name: remove?.name ?? '' })}
          confirmLabel={t('confirm')}
          cancelLabel={t('cancel')}
          onClose={() => setRemove(null)}
          onConfirm={() => {
            if (!remove) return
            const deletedId = remove.id
            setRemove(null)
            void deleteTableInProject({
              projectId,
              tableId: deletedId,
              tables: tableRows,
              activeTableId: tableId,
              queryClient,
              navigate,
              api,
            })
          }}
        />
      </section>
    </TableToolbarProvider>
  )
}
