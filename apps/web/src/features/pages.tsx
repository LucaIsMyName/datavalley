import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, GripVertical, Info, MoreHorizontal, Pencil, Plus, Star, Trash2, Users } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import type { FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Navigate, Outlet, useLocation, useMatch, useNavigate, useParams, useSearchParams } from 'react-router'
import { ApiClientError, type Project, type TableRecord, type User } from '@datavalley/api-client'
import { IconButton } from '../components/icon-button'
import { QuietInput } from '../components/quiet-input'
import { ResourceIcon } from '../components/resource-icon'
import { pressMenuProps, useContextMenu } from '../components/context-menu'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '../components/ui/select'
import { ConfirmDialog, PromptDialog } from '../components/confirm-dialog'
import { EmptyState, ErrorState, LoadingBlock, Page } from '../components/states'
import { patchCachedTable } from './tables/cache'
import { pushCommand } from './tables/history'
import { createdProjectPath } from './tables/grid-ux'
import { tabDropEdge } from './tables/drop-place'
import { moveTab, tableNameFromFile } from './tables/table-tabs'
import { openRegisteredTableMenu } from './tables/table-menu'
import { api } from '../lib/api'
import { sync } from '../lib/sync'
import { applyTheme, useSession } from '../stores/session'

export function LoginPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const setUser = useSession((state) => state.setUser)
  const [error, setError] = useState('')
  const [totp, setTotp] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    try {
      await api.ensureCsrf()
      const result = await api.request<{ user: User; mustChangePassword: boolean }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          login: data.get('login'),
          password: data.get('password'),
          totpCode: data.get('totp') || undefined,
        }),
      })
      setUser(result.user)
      await i18n.changeLanguage(result.user.locale)
      navigate(result.mustChangePassword ? '/change-password' : '/')
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.code === 'totp_required') {
        setTotp(true)
        return
      }
      setError(caught instanceof Error ? caught.message : t('error'))
    }
  }

  return (
    <main className="grid min-h-screen place-items-center p-4 md:p-6">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold">{t('login')}</h1>
        <form className="mt-4 flex flex-col gap-3" onSubmit={onSubmit}>
          <Label htmlFor="login">{t('username')}</Label>
          <Input id="login" name="login" autoComplete="username" required />
          <Label htmlFor="password">{t('password')}</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
          {totp ? (
            <>
              <Label htmlFor="totp">{t('confirmCode')}</Label>
              <Input id="totp" name="totp" inputMode="numeric" autoComplete="one-time-code" required />
            </>
          ) : null}
          {error ? <p role="alert" className="min-h-5 text-sm text-danger">{error}</p> : <p className="min-h-5" />}
          <Button type="submit">{t('login')}</Button>
          <Link to="/forgot-password" className="text-sm underline">{t('forgotPassword')}</Link>
        </form>
      </Card>
    </main>
  )
}

export function ChangePasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  return (
    <main className="grid min-h-screen place-items-center p-4 md:p-6">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold">{t('changePassword')}</h1>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            try {
              await api.request('/auth/change-password', {
                method: 'POST',
                body: JSON.stringify({ currentPassword: data.get('current'), newPassword: data.get('next') }),
              })
              const me = await api.request<{ user: User }>('/auth/me')
              useSession.getState().setUser(me.user)
              navigate('/')
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : t('error'))
            }
          }}
        >
          <Label htmlFor="current">{t('currentPassword')}</Label>
          <Input id="current" name="current" type="password" required />
          <Label htmlFor="next">{t('newPassword')}</Label>
          <Input id="next" name="next" type="password" minLength={12} required />
          {error ? <p role="alert" className="min-h-5 text-sm text-danger">{error}</p> : <p className="min-h-5" />}
          <Button type="submit">{t('save')}</Button>
        </form>
      </Card>
    </main>
  )
}

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  return (
    <main className="grid min-h-screen place-items-center p-4 md:p-6">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold">{t('forgotPassword')}</h1>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            setError('')
            try {
              await api.ensureCsrf()
              await api.request('/auth/forgot-password', {
                method: 'POST',
                body: JSON.stringify({ email: data.get('email') }),
              })
              setSent(true)
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : t('error'))
            }
          }}
        >
          <Label htmlFor="reset-email">{t('email')}</Label>
          <Input id="reset-email" name="email" type="email" autoComplete="email" required />
          {sent ? <p className="min-h-5 text-sm">{t('forgotPasswordSent')}</p> : error ? <p role="alert" className="min-h-5 text-sm text-danger">{error}</p> : <p className="min-h-5" />}
          <Button type="submit">{t('sendResetLink')}</Button>
          <Link to="/login" className="text-sm underline">{t('login')}</Link>
        </form>
      </Card>
    </main>
  )
}

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [error, setError] = useState(token ? '' : t('invalidResetLink'))
  return (
    <main className="grid min-h-screen place-items-center p-4 md:p-6">
      <Card className="w-full max-w-sm p-6">
        <h1 className="text-xl font-semibold">{t('resetPassword')}</h1>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            setError('')
            try {
              await api.ensureCsrf()
              await api.request('/auth/reset-password', {
                method: 'POST',
                body: JSON.stringify({ token, newPassword: data.get('next') }),
              })
              navigate('/login')
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : t('error'))
            }
          }}
        >
          <Label htmlFor="reset-next">{t('newPassword')}</Label>
          <Input id="reset-next" name="next" type="password" autoComplete="new-password" minLength={12} required />
          {error ? <p role="alert" className="min-h-5 text-sm text-danger">{error}</p> : <p className="min-h-5" />}
          <Button type="submit" disabled={!token}>{t('save')}</Button>
        </form>
      </Card>
    </main>
  )
}

type SavedHit = { resourceType: string; resourceId: string; title: string; icon: string; href: string }

function SavedRows({ items, empty }: { items: SavedHit[]; empty: string }) {
  if (items.length === 0) return <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="mt-2 max-h-80 overflow-auto">
      {items.map((item) => (
        <li key={`${item.resourceType}:${item.resourceId}`} className="border-t border-border">
          <Link to={item.href} className="flex min-h-11 items-center gap-2 text-sm">
            <ResourceIcon name={item.icon} />
            <span className="truncate">{item.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function DashboardPage() {
  const { t } = useTranslation()
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.request<{ projects: Project[] }>('/projects') })
  const recents = useQuery({ queryKey: ['recents'], queryFn: () => api.request<{ recents: SavedHit[] }>('/recents') })
  const favorites = useQuery({ queryKey: ['favorites'], queryFn: () => api.request<{ favorites: SavedHit[] }>('/favorites') })
  if (projects.isError) return <Page title={t('dashboard')}><ErrorState message={(projects.error as Error).message} /></Page>
  const projectRows = projects.data?.projects ?? []
  return (
    <Page title={t('dashboard')}>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex min-h-40 flex-col p-4">
          <h2 className="font-medium">{t('projects')}</h2>
          {projects.isLoading ? <LoadingBlock /> : null}
          {projectRows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t('emptyProjects')}</p> : (
            <div className="mt-2 max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <tbody>
                  {projectRows.map((project) => (
                    <tr key={project.id} className="border-t border-border">
                      <td>
                        <Link to={`/projects/${project.id}`} className="flex min-h-11 items-center gap-2">
                          <ResourceIcon name={project.icon} />
                          <span className="truncate">{project.name}</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card className="min-h-40 p-4">
          <h2 className="font-medium">{t('recent')}</h2>
          {recents.isLoading ? <LoadingBlock /> : recents.isError ? <ErrorState message={(recents.error as Error).message} /> : (
            <SavedRows items={recents.data?.recents ?? []} empty={t('recentEmpty')} />
          )}
        </Card>
        <Card className="min-h-40 p-4">
          <h2 className="font-medium">{t('favorites')}</h2>
          {favorites.isLoading ? <LoadingBlock /> : favorites.isError ? <ErrorState message={(favorites.error as Error).message} /> : (
            <SavedRows items={favorites.data?.favorites ?? []} empty={t('favoritesEmpty')} />
          )}
        </Card>
      </div>
    </Page>
  )
}

export function ProjectsPage() {
  const { t } = useTranslation()
  const user = useSession((state) => state.user)
  const navigate = useNavigate()
  const openMenu = useContextMenu()
  const queryClient = useQueryClient()
  const [rename, setRename] = useState<Project | null>(null)
  const [remove, setRemove] = useState<Project | null>(null)
  const [creating, setCreating] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [customers, setCustomers] = useState(false)
  const [createError, setCreateError] = useState('')
  const nameInput = useRef<HTMLInputElement>(null)
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.request<{ projects: Project[] }>('/projects') })
  const create = useMutation({
    mutationFn: (input: { name: string; template?: 'customers' }) =>
      api.request<{ project: Project }>('/projects', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      setCreating(false)
      setCreateError('')
      const path = createdProjectPath(result)
      if (path) navigate(path)
    },
    onError: (error) => {
      setCreateError(error instanceof Error ? error.message : t('error'))
    },
  })
  useEffect(() => {
    if (!creating) return
    const frame = window.requestAnimationFrame(() => nameInput.current?.select())
    return () => window.cancelAnimationFrame(frame)
  }, [creating])
  return (
    <Page
      title={t('projects')}
      actions={user?.role === 'admin' ? <Button type="button" onClick={() => { setProjectName(t('name')); setCustomers(false); setCreating(true) }}>{t('newProject')}</Button> : null}
    >
      {projects.isLoading && !projects.data ? <LoadingBlock /> : null}
      {projects.isError ? <ErrorState message={(projects.error as Error).message} /> : null}
      {projects.data && projects.data.projects.length === 0 ? <EmptyState title={t('emptyProjects')} body={t('emptyProjectsBody')} /> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {projects.data?.projects.map((project) => {
          const items = [
            { id: 'open', label: t('open'), icon: FolderOpen, onSelect: () => navigate(`/projects/${project.id}`) },
            ...(user?.role === 'admin'
              ? [
                  { id: 'rename', label: t('rename'), icon: Pencil, onSelect: () => setRename(project) },
                  { id: 'delete', label: t('delete'), icon: Trash2, danger: true, onSelect: () => setRemove(project) },
                ]
              : []),
          ]
          return (
          <Link
            key={project.id}
            to={`/projects/${project.id}`}
            onContextMenu={(event) => openMenu(event, items)}
          >
            <Card className="flex min-h-24 items-center gap-2 p-4 hover:bg-accent">
              <ResourceIcon name={project.icon} />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              <button
                type="button"
                aria-label={t('menu')}
                className="inline-flex size-8 shrink-0 items-center justify-center hover:bg-accent"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  openMenu(event, items)
                }}
              >
                <MoreHorizontal className="size-4" />
              </button>
            </Card>
          </Link>
          )
        })}
      </div>
      <Dialog.Root open={creating} onOpenChange={(open) => { if (!open) setCreating(false) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2  border border-border bg-card p-4 shadow-md">
            <Dialog.Title className="text-base font-semibold">{t('newProject')}</Dialog.Title>
            <Dialog.Description className="sr-only">{t('newProject')}</Dialog.Description>
            <form
              className="mt-3 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                const name = projectName.trim()
                if (!name) return
                setCreateError('')
                create.mutate({ name, template: customers ? 'customers' : undefined })
              }}
            >
              <input
                ref={nameInput}
                autoFocus
                aria-label={t('name')}
                className="h-9 w-full border border-border bg-card px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
              />
              <label htmlFor="project-customers-template" className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  id="project-customers-template"
                  checked={customers}
                  onCheckedChange={(next) => setCustomers(next === true)}
                />
                {t('customersTemplate')}
              </label>
              {createError ? <p role="alert" className="text-sm text-danger">{createError}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCreating(false)}>{t('cancel')}</Button>
                <Button type="submit" disabled={create.isPending}>{t('confirm')}</Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <PromptDialog
        open={Boolean(rename)}
        title={t('rename')}
        label={t('name')}
        value={rename?.name ?? ''}
        confirmLabel={t('save')}
        cancelLabel={t('cancel')}
        onClose={() => setRename(null)}
        onSubmit={(next) => {
          if (!rename) return
          void api.request(`/projects/${rename.id}`, { method: 'PATCH', body: JSON.stringify({ name: next }) }).then(() => queryClient.invalidateQueries({ queryKey: ['projects'] }))
          setRename(null)
        }}
      />
      <ConfirmDialog
        open={Boolean(remove)}
        title={t('deleteProjectTitle')}
        body={t('deleteProjectWarning', { name: remove?.name ?? '' })}
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        onClose={() => setRemove(null)}
        onConfirm={() => {
          if (!remove) return
          void api.request(`/projects/${remove.id}`, { method: 'DELETE' }).then(() => queryClient.invalidateQueries({ queryKey: ['projects'] }))
          setRemove(null)
        }}
      />
    </Page>
  )
}

function ProjectDescription({ projectId, value }: { projectId: string; value: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [text, setText] = useState(value)
  const focused = useRef(false)
  const baseline = useRef(value)
  useEffect(() => {
    if (focused.current) return
    setText(value)
    baseline.current = value
  }, [value])
  return (
    <textarea
      aria-label={t('description')}
      className="min-h-40 w-full flex-1 resize-none  border border-border bg-transparent p-2 text-sm leading-5 outline-none"
      value={text}
      placeholder={t('description')}
      onFocus={() => { focused.current = true }}
      onChange={(event) => {
        const next = event.target.value
        setText(next)
        sync.edit(`project:${projectId}:description`, {
          draft: next,
          delay: 300,
          apply: () => undefined,
          commit: (draft) => api.request<{ project: Project }>(`/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify({ description: draft }) }),
          accept: (result) => {
            baseline.current = result.project.description
            queryClient.setQueryData(['project', projectId], result)
          },
          rollback: () => setText(baseline.current),
        })
      }}
      onBlur={() => {
        focused.current = false
        void sync.flush(`project:${projectId}:description`)
      }}
    />
  )
}

function rememberTableName(queryClient: ReturnType<typeof useQueryClient>, projectId: string, tableId: string, name: string) {
  queryClient.setQueryData(['tables', projectId], (current: { tables: TableRecord[] } | undefined) => {
    if (!current) return current
    return { tables: current.tables.map((table) => (table.id === tableId ? { ...table, name } : table)) }
  })
  patchCachedTable(queryClient, tableId, (current) => ({ ...current, name }))
}

export function ProjectPage() {
  const { projectId = '' } = useParams()
  const tableMatch = useMatch('/projects/:projectId/tables/:tableId')
  const tableId = tableMatch?.params.tableId ?? ''
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const openMenu = useContextMenu()
  const queryClient = useQueryClient()
  const nameRef = useRef<HTMLInputElement>(null)
  const pressTimer = useRef(0)
  const pressOrigin = useRef({ x: 0, y: 0 })
  const tabFrom = useRef<string | null>(null)
  const [tabOver, setTabOver] = useState<string | null>(null)
  const [membersOpen, setMembersOpen] = useState(false)
  const [descriptionOpen, setDescriptionOpen] = useState(false)
  const [memberName, setMemberName] = useState('')
  const [memberError, setMemberError] = useState('')
  const [dropMember, setDropMember] = useState<{ userId: string; username: string } | null>(null)
  const [remove, setRemove] = useState<TableRecord | null>(null)
  const [creatingTable, setCreatingTable] = useState(false)
  const [tableKind, setTableKind] = useState<'blank' | 'demo' | 'csv'>('blank')
  const [csvName, setCsvName] = useState('')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvHeader, setCsvHeader] = useState(true)
  const [createTableError, setCreateTableError] = useState('')
  const [creatingTableBusy, setCreatingTableBusy] = useState(false)
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => api.request<{ project: Project }>(`/projects/${projectId}`) })
  const tables = useQuery({ queryKey: ['tables', projectId], queryFn: () => api.request<{ tables: TableRecord[] }>(`/projects/${projectId}/tables`) })
  const members = useQuery({
    queryKey: ['members', projectId],
    enabled: membersOpen,
    queryFn: () => api.request<{ members: { userId: string; username: string; email: string; role: string; disabled: boolean }[]; canManage: boolean }>(`/projects/${projectId}/members`),
  })
  const directory = useQuery({
    queryKey: ['directory', projectId, memberName],
    enabled: membersOpen,
    queryFn: () => api.request<{ users: { id: string; username: string; email: string }[] }>(`/projects/${projectId}/directory?q=${encodeURIComponent(memberName)}`),
  })
  const savedFavorites = useQuery({
    queryKey: ['favorites'],
    queryFn: () => api.request<{ favorites: SavedHit[] }>('/favorites'),
  })
  const projectFavorited = savedFavorites.data?.favorites.some((item) => item.resourceType === 'project' && item.resourceId === projectId) ?? false
  const record = project.data?.project
  const tableRows = tables.data?.tables ?? []
  const active = tableRows.find((table) => table.id === tableId)

  useEffect(() => {
    const state = location.state as { focusName?: boolean } | null
    if (!state?.focusName || !active) return
    nameRef.current?.select()
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
  }, [active, location.pathname, location.search, location.state, navigate])

  if (project.isLoading || tables.isLoading) return <Page title={t('projects')}><LoadingBlock /></Page>
  if (project.isError) return <Page title={t('projects')}><ErrorState message={(project.error as Error).message} /></Page>
  if (tables.isError) return <Page title={t('projects')}><ErrorState message={(tables.error as Error).message} /></Page>
  if (!tableId && tableRows.length > 0) return <Navigate to={`/projects/${projectId}/tables/${tableRows[0].id}`} replace />

  function scheduleProjectName(next: string) {
    const before = record?.name ?? ''
    sync.edit(`project:${projectId}:name`, {
      draft: next,
      delay: 300,
      apply: () => undefined,
      commit: async (draft) => {
        const trimmed = draft.trim()
        if (!trimmed || trimmed === before) return record ?? { id: projectId, name: before, description: '', icon: 'FolderKanban', archivedAt: null, organizationId: '' }
        const result = await api.request<{ project: Project }>(`/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify({ name: trimmed }) })
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
        await api.request(`/tables/${table.id}`, { method: 'PATCH', body: JSON.stringify({ name: trimmed }) })
        return { name: trimmed }
      },
      accept: (saved) => {
        rememberTableName(queryClient, projectId, table.id, saved.name)
        if (saved.name !== before) pushCommand(table.id, { kind: 'table-renamed', before, after: saved.name })
      },
      rollback: () => rememberTableName(queryClient, projectId, table.id, before),
    })
  }

  async function saveIcon(kind: 'project' | 'table', id: string, icon: string) {
    if (kind === 'project') {
      const result = await api.request<{ project: Project }>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ icon }) })
      queryClient.setQueryData(['project', projectId], result)
      void queryClient.invalidateQueries({ queryKey: ['projects'] })
      return
    }
    const result = await api.request<{ table: TableRecord }>(`/tables/${id}`, { method: 'PATCH', body: JSON.stringify({ icon }) })
    queryClient.setQueryData(['tables', projectId], (current: { tables: TableRecord[] } | undefined) => {
      if (!current) return current
      return { tables: current.tables.map((table) => (table.id === id ? { ...table, icon: result.table.icon } : table)) }
    })
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
    navigate(`/projects/${projectId}/tables/${table.id}`, focusName ? { state: { focusName: true } } : undefined)
  }

  async function submitNewTable() {
    setCreateTableError('')
    setCreatingTableBusy(true)
    try {
      if (tableKind === 'csv') {
        if (!csvFile) throw new Error(t('chooseCsv'))
        const name = csvName.trim() || tableNameFromFile(csvFile.name)
        if (!name) throw new Error(t('tableName'))
        const body = new FormData()
        body.append('file', csvFile)
        body.append('name', name)
        body.append('headerRow', csvHeader ? 'true' : 'false')
        const created = await api.request<{ table: TableRecord }>(`/projects/${projectId}/tables/import`, { method: 'POST', body })
        setCreatingTable(false)
        await openCreatedTable(created.table, false)
        return
      }
      const created = await api.request<{ table: TableRecord }>(`/projects/${projectId}/tables`, {
        method: 'POST',
        body: JSON.stringify(tableKind === 'demo' ? { template: 'demo' } : {}),
      })
      setCreatingTable(false)
      await openCreatedTable(created.table, tableKind === 'blank')
    } catch (error) {
      setCreateTableError(error instanceof Error ? error.message : t('error'))
    } finally {
      setCreatingTableBusy(false)
    }
  }

  const favoriteBody = JSON.stringify({ resourceType: 'project', resourceId: projectId })

  function toggleProjectFavorite() {
    void api.request('/favorites', { method: projectFavorited ? 'DELETE' : 'POST', body: favoriteBody }).then(() => queryClient.invalidateQueries({ queryKey: ['favorites'] }))
  }

  const favoriteProject = [
    {
      id: 'favorite',
      label: t('addToFavorites'),
      icon: Star,
      onSelect: () => {
        void api.request('/favorites', { method: 'POST', body: favoriteBody }).then(() => queryClient.invalidateQueries({ queryKey: ['favorites'] }))
      },
    },
  ]

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-col gap-3 px-4 pt-4 md:px-6 md:pt-6">
        <div className="flex min-h-10 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="flex min-w-0 items-center gap-2"
            {...pressMenuProps(openMenu, pressTimer, pressOrigin, favoriteProject)}
          >
            <IconButton name={record?.icon ?? 'FolderKanban'} onChange={(icon) => void saveIcon('project', projectId, icon)} />
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
            const tabEdge = tabOver === table.id ? tabDropEdge(tableRows.map((item) => item.id), tabFrom.current ?? '', table.id) : null
            const items = [
              { id: 'open', label: t('open'), icon: FolderOpen, onSelect: () => navigate(`/projects/${projectId}/tables/${table.id}`) },
              {
                id: 'favorite',
                label: t('addToFavorites'),
                icon: Star,
                onSelect: () => {
                  void api.request('/favorites', { method: 'POST', body: JSON.stringify({ resourceType: 'table', resourceId: table.id }) }).then(() => queryClient.invalidateQueries({ queryKey: ['favorites'] }))
                },
              },
              { id: 'delete', label: t('delete'), icon: Trash2, danger: true, onSelect: () => setRemove(table) },
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
                  const next = tabDropEdge(tableRows.map((item) => item.id), from, table.id) ? table.id : null
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
                          openRegisteredTableMenu({ preventDefault() {}, clientX: point.x, clientY: point.y } as ReactMouseEvent)
                        }, 500)
                      },
                      onPointerMove: (event: ReactPointerEvent) => {
                        if (Math.hypot(event.clientX - pressOrigin.current.x, event.clientY - pressOrigin.current.y) > 10) {
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
                <IconButton name={table.icon} onChange={(icon) => void saveIcon('table', table.id, icon)} />
                {current ? (
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
                ) : (
                  <Link to={`/projects/${projectId}/tables/${table.id}`} className="inline-block w-max max-w-48 truncate text-sm font-medium">
                    {table.name}
                  </Link>
                )}
              </div>
            )
          })}
          <button
            type="button"
            className="flex h-10 shrink-0 items-center gap-1 whitespace-nowrap border border-transparent text-sm font-medium"
            onClick={() => {
              setTableKind('blank')
              setCsvName('')
              setCsvFile(null)
              setCsvHeader(true)
              setCreateTableError('')
              setCreatingTable(true)
            }}
          >
            <Plus className="size-4" />
            {t('newTable')}
          </button>
        </div>
      </header>
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
            <Dialog.Close className="self-end border border-border px-3 py-1.5 text-sm">{t('close')}</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={membersOpen}
        onOpenChange={(open) => {
          setMembersOpen(open)
          if (!open) {
            setMemberName('')
            setMemberError('')
            setDropMember(null)
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[min(32rem,calc(100vh-2rem))] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-auto  border border-border bg-card p-4 shadow-md">
            <div className="flex items-start justify-between gap-2">
              <Dialog.Title className="text-base font-semibold">{t('members')}</Dialog.Title>
              <Dialog.Close className="border border-border px-3 py-1.5 text-sm">{t('close')}</Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">{t('members')}</Dialog.Description>
            <ul className="mt-3 min-h-8 text-sm">
              {members.isLoading ? <li><LoadingBlock /></li> : null}
              {members.data && members.data.members.length === 0 ? <li className="text-muted-foreground">{t('emptyMembers')}</li> : null}
              {members.data?.members.map((member) => {
                const roster = members.data?.members ?? []
                const activeAdmins = roster.filter((item) => item.role === 'admin' && !item.disabled).length
                const lastAdmin = member.role === 'admin' && !member.disabled && activeAdmins <= 1
                return (
                  <li key={member.userId} className="flex min-h-11 flex-wrap items-center gap-2 py-1">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{member.username}</span>
                      <span className="block truncate text-muted-foreground">{member.email}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">{member.role === 'admin' ? t('roleAdmin') : t('roleUser')}</span>
                    {member.disabled ? <span className="shrink-0 text-muted-foreground">{t('disabled')}</span> : null}
                    {members.data?.canManage ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0 whitespace-nowrap"
                          disabled={lastAdmin}
                          title={lastAdmin ? t('lastAdminHint') : undefined}
                          onClick={() => {
                            setMemberError('')
                            void api.request(`/projects/${projectId}/members/${member.userId}`, { method: 'PATCH', body: JSON.stringify({ disabled: !member.disabled }) })
                              .then(() => queryClient.invalidateQueries({ queryKey: ['members', projectId] }))
                              .catch((error: unknown) => setMemberError(error instanceof ApiClientError ? error.message : t('error')))
                          }}
                        >
                          {member.disabled ? t('enable') : t('disable')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0 whitespace-nowrap"
                          disabled={lastAdmin || roster.length <= 1}
                          title={lastAdmin ? t('lastAdminHint') : undefined}
                          onClick={() => setDropMember(member)}
                        >
                          {t('removeMember')}
                        </Button>
                      </>
                    ) : null}
                  </li>
                )
              })}
            </ul>
            {memberError ? <p role="alert" className="mt-2 text-sm text-danger">{memberError}</p> : null}
            <form
              className="mt-3"
              onSubmit={async (event) => {
                event.preventDefault()
                const username = memberName.trim()
                if (!username) return
                setMemberError('')
                try {
                  await api.request(`/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify({ username }) })
                  setMemberName('')
                  await queryClient.invalidateQueries({ queryKey: ['members', projectId] })
                  await queryClient.invalidateQueries({ queryKey: ['directory', projectId] })
                } catch (error) {
                  setMemberError(error instanceof ApiClientError ? error.message : t('error'))
                }
              }}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  name="username"
                  value={memberName}
                  placeholder={t('username')}
                  aria-label={t('username')}
                  className="min-w-0 flex-1"
                  onChange={(event) => setMemberName(event.target.value)}
                  required
                />
                <Button type="submit" variant="outline" className="shrink-0 whitespace-nowrap">{t('addMember')}</Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t('directoryHint')}</p>
              <ul className="mt-1 max-h-60 overflow-auto">
                {directory.data?.users.map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center gap-3  px-2 text-left text-sm hover:bg-accent"
                      onClick={() => setMemberName(user.username)}
                    >
                      <span className="truncate font-medium">{user.username}</span>
                      <span className="min-w-0 truncate text-muted-foreground">{user.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <ConfirmDialog
        open={Boolean(dropMember)}
        title={t('removeMemberTitle')}
        body={t('removeMemberWarning', { name: dropMember?.username ?? '' })}
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        onClose={() => setDropMember(null)}
        onConfirm={() => {
          if (!dropMember) return
          const userId = dropMember.userId
          setDropMember(null)
          setMemberError('')
          void api.request(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' })
            .then(() => queryClient.invalidateQueries({ queryKey: ['members', projectId] }))
            .then(() => queryClient.invalidateQueries({ queryKey: ['directory', projectId] }))
            .catch((error: unknown) => setMemberError(error instanceof ApiClientError ? error.message : t('error')))
        }}
      />
      <Dialog.Root open={creatingTable} onOpenChange={(open) => { if (!open) setCreatingTable(false) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2  border border-border bg-card p-4 shadow-md">
            <Dialog.Title className="text-base font-semibold">{t('newTable')}</Dialog.Title>
            <Dialog.Description className="sr-only">{t('newTable')}</Dialog.Description>
            <form
              className="mt-3 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                void submitNewTable()
              }}
            >
              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">{t('newTable')}</legend>
                <RadioGroup value={tableKind} onValueChange={(value) => setTableKind(value as typeof tableKind)} className="gap-2">
                  {([
                    ['blank', 'blankTable'],
                    ['demo', 'demoTable'],
                    ['csv', 'importCsv'],
                  ] as const).map(([value, key]) => (
                    <label key={value} htmlFor={`table-kind-${value}`} className="flex cursor-pointer items-center gap-2 text-sm">
                      <RadioGroupItem value={value} id={`table-kind-${value}`} />
                      {t(key)}
                    </label>
                  ))}
                </RadioGroup>
              </fieldset>
              {tableKind === 'csv' ? (
                <>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    aria-label={t('importCsv')}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null
                      setCsvFile(file)
                      if (file) setCsvName(tableNameFromFile(file.name))
                    }}
                  />
                  <input
                    aria-label={t('tableName')}
                    className="h-9 w-full border border-border bg-card px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    value={csvName}
                    onChange={(event) => setCsvName(event.target.value)}
                  />
                  <label htmlFor="csv-has-header" className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      id="csv-has-header"
                      checked={csvHeader}
                      onCheckedChange={(next) => setCsvHeader(next === true)}
                    />
                    {t('csvHasHeader')}
                  </label>
                </>
              ) : null}
              {createTableError ? <p role="alert" className="text-sm text-danger">{createTableError}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCreatingTable(false)}>{t('cancel')}</Button>
                <Button type="submit" disabled={creatingTableBusy}>{t('confirm')}</Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <ConfirmDialog
        open={Boolean(remove)}
        title={t('deleteTableTitle')}
        body={t('deleteTableWarning', { name: remove?.name ?? '' })}
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        onClose={() => setRemove(null)}
        onConfirm={() => {
          if (!remove) return
          const next = tableRows.find((table) => table.id !== remove.id)
          void api.request(`/tables/${remove.id}`, { method: 'DELETE' }).then(async () => {
            await queryClient.invalidateQueries({ queryKey: ['tables', projectId] })
            if (remove.id === tableId) navigate(next ? `/projects/${projectId}/tables/${next.id}` : `/projects/${projectId}`)
          })
          setRemove(null)
        }}
      />
    </section>
  )
}

export function RecentPage() {
  const { t } = useTranslation()
  const recents = useQuery({ queryKey: ['recents'], queryFn: () => api.request<{ recents: SavedHit[] }>('/recents') })
  return (
    <Page title={t('recent')}>
      {recents.isLoading ? <LoadingBlock /> : null}
      {recents.isError ? <ErrorState message={(recents.error as Error).message} /> : null}
      {(recents.data?.recents.length ?? 0) === 0 && !recents.isLoading ? <EmptyState title={t('recentEmpty')} body={t('recentEmptyBody')} /> : null}
      <ul className="flex flex-col gap-2">
        {recents.data?.recents.map((item) => (
          <li key={`${item.resourceType}:${item.resourceId}`}>
            <Link to={item.href}>
              <Card className="flex min-h-11 items-center gap-2 p-3 text-sm">
                <ResourceIcon name={item.icon} />
                <span className="truncate">{item.title}</span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  )
}

export function FavoritesPage() {
  const { t } = useTranslation()
  const favorites = useQuery({ queryKey: ['favorites'], queryFn: () => api.request<{ favorites: SavedHit[] }>('/favorites') })
  return (
    <Page title={t('favorites')}>
      {favorites.isLoading ? <LoadingBlock /> : null}
      {favorites.isError ? <ErrorState message={(favorites.error as Error).message} /> : null}
      {(favorites.data?.favorites.length ?? 0) === 0 && !favorites.isLoading ? <EmptyState title={t('favoritesEmpty')} body={t('favoritesEmptyBody')} /> : null}
      <ul className="flex flex-col gap-2">
        {favorites.data?.favorites.map((item) => (
          <li key={`${item.resourceType}:${item.resourceId}`}>
            <Link to={item.href}>
              <Card className="flex min-h-11 items-center gap-2 p-3 text-sm">
                <ResourceIcon name={item.icon} />
                <span className="truncate">{item.title}</span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  )
}

export function IntegrationsPage() {
  const { t } = useTranslation()
  const plugins = useQuery({ queryKey: ['plugins'], queryFn: () => api.request<{ plugins: { id: string; name: string; enabled: boolean }[] }>('/plugins') })
  const [pending, setPending] = useState<string | null>(null)
  return (
    <Page title={t('integrations')}>
      {plugins.isLoading ? <LoadingBlock /> : null}
      {plugins.isError ? <ErrorState message={(plugins.error as Error).message} /> : null}
      {plugins.data && plugins.data.plugins.length === 0 ? <EmptyState title={t('emptyIntegrations')} body={t('emptyIntegrations')} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {plugins.data?.plugins.map((plugin) => (
          <Card key={plugin.id} className="flex min-h-24 flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-medium">{plugin.name}</p>
              <p className="text-sm text-muted-foreground">{plugin.enabled ? t('enabled') : t('disabled')}</p>
            </div>
            <Button
              variant="outline"
              disabled={pending === plugin.id}
              onClick={() => {
                setPending(plugin.id)
                void api.request(`/plugins/${plugin.id}/${plugin.enabled ? 'disable' : 'enable'}`, { method: 'POST' })
                  .then(() => plugins.refetch())
                  .finally(() => setPending(null))
              }}
            >
              {plugin.enabled ? t('disable') : t('enable')}
            </Button>
          </Card>
        ))}
      </div>
    </Page>
  )
}

function SettingsNav() {
  const { t } = useTranslation()
  const user = useSession((state) => state.user)
  const links = [
    { to: '/settings/profile', key: 'profile' },
    ...(user?.role === 'admin'
      ? [
          { to: '/settings/users', key: 'users' },
          { to: '/settings/api-keys', key: 'apiKeys' },
          { to: '/settings/audit', key: 'audit' },
        ]
      : []),
  ]
  return (
    <nav className="flex min-h-9 flex-wrap gap-2 text-sm">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) => `px-2 py-1 ${isActive ? 'bg-accent font-medium' : 'hover:bg-accent'}`}
        >
          {t(link.key)}
        </NavLink>
      ))}
    </nav>
  )
}

export function UsersPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [role, setRole] = useState('user')
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.request<{ users: User[] }>('/users') })
  return (
    <Page title={t('users')}>
      <SettingsNav />
      <form
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
        onSubmit={async (event) => {
          event.preventDefault()
          const form = event.currentTarget
          const data = new FormData(form)
          await api.request('/users', {
            method: 'POST',
            body: JSON.stringify({
              username: data.get('username'),
              email: data.get('email'),
              password: data.get('password'),
              role,
            }),
          })
          await queryClient.invalidateQueries({ queryKey: ['users'] })
          form.reset()
          setRole('user')
        }}
      >
        <div className="grid gap-1">
          <Label htmlFor="new-username">{t('username')}</Label>
          <Input id="new-username" name="username" required className="sm:w-32" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="new-email">{t('email')}</Label>
          <Input id="new-email" name="email" type="email" required className="sm:w-44" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="new-password">{t('password')}</Label>
          <Input id="new-password" name="password" type="password" required minLength={12} className="sm:w-40" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="new-role">{t('role')}</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger id="new-role" aria-label={t('role')} className="sm:w-32">
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">{t('roleUser')}</SelectItem>
              <SelectItem value="admin">{t('roleAdmin')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit">{t('create')}</Button>
      </form>
      {users.isLoading ? <LoadingBlock /> : null}
      {users.isError ? <ErrorState message={(users.error as Error).message} /> : null}
      {users.data && users.data.users.length === 0 ? <EmptyState title={t('emptyUsers')} body={t('emptyUsers')} /> : null}
      <div className="overflow-hidden border border-border">
        {users.data?.users.map((user) => (
          <div key={user.id} className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-3 text-sm last:border-b-0">
            <span className="min-w-0 truncate">{user.username} · {user.email}</span>
            <span className="shrink-0 text-muted-foreground">{user.role === 'admin' ? t('roleAdmin') : t('roleUser')}</span>
          </div>
        ))}
      </div>
    </Page>
  )
}

export function ApiKeysPage() {
  const { t } = useTranslation()
  const [created, setCreated] = useState('')
  const [revoke, setRevoke] = useState<{ id: string; name: string } | null>(null)
  const keys = useQuery({ queryKey: ['api-keys'], queryFn: () => api.request<{ apiKeys: { id: string; name: string; prefix: string; revokedAt: string | null }[] }>('/api-keys') })
  return (
    <Page title={t('apiKeys')}>
      <SettingsNav />
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={async (event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          const result = await api.request<{ apiKey: { key: string } }>('/api-keys', { method: 'POST', body: JSON.stringify({ name: data.get('name'), scopes: [] }) })
          setCreated(result.apiKey.key)
          await keys.refetch()
        }}
      >
        <Input name="name" required placeholder={t('name')} className="max-w-xs" />
        <Button type="submit">{t('createKey')}</Button>
      </form>
      {created ? <Card className="min-h-20 p-3 text-sm">{t('keyOnce')}<p className="mt-2 font-mono break-all">{created}</p></Card> : <div className="min-h-0" />}
      {keys.isLoading ? <LoadingBlock /> : null}
      {keys.data && keys.data.apiKeys.length === 0 ? <EmptyState title={t('emptyApiKeys')} body={t('emptyApiKeys')} /> : null}
      {keys.data?.apiKeys.map((key) => (
        <Card key={key.id} className="flex flex-col items-start justify-between gap-2 p-3 text-sm sm:flex-row sm:items-center">
          <span>{key.name} · {key.prefix}</span>
          <Button variant="outline" onClick={() => setRevoke({ id: key.id, name: key.name })}>{t('revoke')}</Button>
        </Card>
      ))}
      <ConfirmDialog
        open={Boolean(revoke)}
        title={t('revokeKeyTitle')}
        body={t('revokeKeyWarning', { name: revoke?.name ?? '' })}
        confirmLabel={t('revoke')}
        cancelLabel={t('cancel')}
        onClose={() => setRevoke(null)}
        onConfirm={() => {
          if (!revoke) return
          const id = revoke.id
          setRevoke(null)
          void api.request(`/api-keys/${id}`, { method: 'DELETE' }).then(() => keys.refetch())
        }}
      />
    </Page>
  )
}

export function AuditPage() {
  const { t } = useTranslation()
  const audit = useQuery({ queryKey: ['audit'], queryFn: () => api.request<{ entries: { id: string; action: string; createdAt: string }[] }>('/audit') })
  return (
    <Page title={t('audit')}>
      <SettingsNav />
      {audit.isLoading ? <LoadingBlock /> : null}
      {audit.isError ? <ErrorState message={(audit.error as Error).message} /> : null}
      {audit.data && audit.data.entries.length === 0 ? <EmptyState title={t('emptyAudit')} body={t('emptyAudit')} /> : null}
      <div className="border border-border">
        {audit.data?.entries.map((entry) => (
          <div key={entry.id} className="flex min-h-10 flex-col gap-1 border-b border-border px-3 py-2 text-sm last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
            <span>{entry.action}</span>
            <span className="text-muted-foreground">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))}</span>
          </div>
        ))}
      </div>
    </Page>
  )
}

function ProfileForm({ user }: { user: User }) {
  const { t, i18n } = useTranslation()
  const setUser = useSession((state) => state.setUser)
  const [locale, setLocale] = useState(user.locale)
  const [theme, setTheme] = useState(user.theme)
  const [timezone, setTimezone] = useState(user.timezone)
  const [totpEnroll, setTotpEnroll] = useState<{ secret: string; url: string } | null>(null)

  async function save(next: { locale: string; theme: 'light' | 'dark' | 'system'; timezone: string }) {
    const result = await api.request<{ user: User }>(`/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify(next),
    })
    setUser(result.user)
    await i18n.changeLanguage(next.locale)
    localStorage.setItem('locale', next.locale)
    applyTheme(next.theme)
  }

  return (
    <Page title={t('profile')}>
      <SettingsNav />
      <div className="grid max-w-md gap-3">
        <Label htmlFor="locale">{t('language')}</Label>
        <Select
          value={locale}
          onValueChange={(value) => {
            setLocale(value)
            void save({ locale: value, theme: theme as 'light' | 'dark' | 'system', timezone })
          }}
        >
          <SelectTrigger id="locale" aria-label={t('language')}>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="de">Deutsch</SelectItem>
          </SelectContent>
        </Select>
        <Label htmlFor="theme">{t('theme')}</Label>
        <Select
          value={theme}
          onValueChange={(value) => {
            const next = value as 'light' | 'dark' | 'system'
            setTheme(next)
            void save({ locale, theme: next, timezone })
          }}
        >
          <SelectTrigger id="theme" aria-label={t('theme')}>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">{t('system')}</SelectItem>
            <SelectItem value="light">{t('light')}</SelectItem>
            <SelectItem value="dark">{t('dark')}</SelectItem>
          </SelectContent>
        </Select>
        <Label htmlFor="timezone">{t('timezone')}</Label>
        <Input
          id="timezone"
          value={timezone}
          onChange={(event) => {
            const next = event.target.value
            setTimezone(next)
            sync.edit(`user:${user.id}:timezone`, {
              draft: next,
              delay: 300,
              apply: () => undefined,
              commit: async (draft) => {
                await save({ locale, theme: theme as 'light' | 'dark' | 'system', timezone: draft })
                return draft
              },
              accept: () => undefined,
              rollback: () => setTimezone(user.timezone),
            })
          }}
          onBlur={() => void sync.flush(`user:${user.id}:timezone`)}
        />
      </div>
      <Card className="max-w-md p-4">
        <h2 className="font-medium">{t('totp')}</h2>
        <Button
          className="mt-3"
          variant="outline"
          onClick={async () => {
            const enrolled = await api.request<{ secret: string; url: string }>('/totp/enroll', { method: 'POST' })
            setTotpEnroll(enrolled)
          }}
        >
          {t('enroll')}
        </Button>
      </Card>
      <Dialog.Root open={Boolean(totpEnroll)} onOpenChange={(open) => { if (!open) setTotpEnroll(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 border border-border bg-card p-4 shadow-md">
            <Dialog.Title className="text-base font-semibold">{t('totp')}</Dialog.Title>
            <Dialog.Description className="sr-only">{t('totp')}</Dialog.Description>
            <div className="mt-3 grid gap-3 text-sm">
              <div>
                <p className="font-medium">{t('totpSecret')}</p>
                <p className="mt-1 break-all font-mono">{totpEnroll?.secret}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    if (totpEnroll) void navigator.clipboard.writeText(totpEnroll.secret)
                  }}
                >
                  {t('copy')}
                </Button>
              </div>
              <div>
                <p className="font-medium">{t('totpUrl')}</p>
                <p className="mt-1 break-all font-mono">{totpEnroll?.url}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    if (totpEnroll) void navigator.clipboard.writeText(totpEnroll.url)
                  }}
                >
                  {t('copy')}
                </Button>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Dialog.Close className="inline-flex h-9 items-center border border-border px-3 text-sm hover:bg-accent">{t('close')}</Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Page>
  )
}

export function ProfilePage() {
  const { t } = useTranslation()
  const user = useSession((state) => state.user)
  if (!user) return <Page title={t('profile')}><LoadingBlock /></Page>
  return <ProfileForm user={user} />
}
