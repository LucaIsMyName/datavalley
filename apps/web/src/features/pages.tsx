import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, useNavigate, useParams, useSearchParams } from 'react-router'
import { ApiClientError, type Project, type TableRecord, type User } from '@datavalley/api-client'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { ConfirmDialog, PromptDialog } from '../components/confirm-dialog'
import { useContextMenu } from '../components/context-menu'
import { EmptyState, ErrorState, LoadingBlock, Page } from '../components/states'
import { TableScreen } from './tables/grid'
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
    <main className="grid min-h-screen place-items-center p-6">
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
              <Input id="totp" name="totp" inputMode="numeric" autoComplete="one-time-code" />
            </>
          ) : null}
          {error ? <p className="min-h-5 text-sm text-danger">{error}</p> : <p className="min-h-5" />}
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
    <main className="grid min-h-screen place-items-center p-6">
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
          {error ? <p className="text-sm text-danger">{error}</p> : null}
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
    <main className="grid min-h-screen place-items-center p-6">
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
          {sent ? <p className="min-h-5 text-sm">{t('forgotPasswordSent')}</p> : error ? <p className="min-h-5 text-sm text-danger">{error}</p> : <p className="min-h-5" />}
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
    <main className="grid min-h-screen place-items-center p-6">
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
          {error ? <p className="min-h-5 text-sm text-danger">{error}</p> : <p className="min-h-5" />}
          <Button type="submit" disabled={!token}>{t('save')}</Button>
        </form>
      </Card>
    </main>
  )
}

export function DashboardPage() {
  const { t } = useTranslation()
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.request<{ projects: Project[] }>('/projects') })
  const recents = useQuery({ queryKey: ['recents'], queryFn: () => api.request<{ recents: { resourceId: string; resourceType: string }[] }>('/recents') })
  const favorites = useQuery({ queryKey: ['favorites'], queryFn: () => api.request<{ favorites: { resourceId: string; resourceType: string }[] }>('/favorites') })
  if (projects.isLoading || recents.isLoading || favorites.isLoading) return <Page title={t('dashboard')}><LoadingBlock /></Page>
  if (projects.isError) return <Page title={t('dashboard')}><ErrorState message={(projects.error as Error).message} /></Page>
  return (
    <Page title={t('dashboard')}>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="min-h-40 p-4">
          <h2 className="font-medium">{t('projects')}</h2>
          {(projects.data?.projects ?? []).slice(0, 5).map((project) => (
            <Link key={project.id} className="mt-2 block text-sm hover:underline" to={`/projects/${project.id}`}>{project.name}</Link>
          ))}
        </Card>
        <Card className="min-h-40 p-4">
          <h2 className="font-medium">{t('recent')}</h2>
          {(recents.data?.recents ?? []).length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t('recentEmpty')}</p> : recents.data?.recents.map((item) => <p key={item.resourceId} className="mt-2 text-sm">{item.resourceType}</p>)}
        </Card>
        <Card className="min-h-40 p-4">
          <h2 className="font-medium">{t('favorites')}</h2>
          {(favorites.data?.favorites ?? []).length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t('favoritesEmpty')}</p> : favorites.data?.favorites.map((item) => <p key={item.resourceId} className="mt-2 text-sm">{item.resourceType}</p>)}
        </Card>
      </div>
    </Page>
  )
}

export function ProjectsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const openMenu = useContextMenu()
  const queryClient = useQueryClient()
  const [rename, setRename] = useState<Project | null>(null)
  const [remove, setRemove] = useState<Project | null>(null)
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api.request<{ projects: Project[] }>('/projects') })
  const create = useMutation({
    mutationFn: (input: { name: string; template?: 'customers' }) => api.request('/projects', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  })
  return (
    <Page
      title={t('projects')}
      actions={
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            create.mutate({ name: String(data.get('name')), template: data.get('template') ? 'customers' : undefined })
            event.currentTarget.reset()
          }}
        >
          <Input name="name" required placeholder={t('name')} className="w-48" />
          <label className="flex items-center gap-2 text-sm">
            <input name="template" type="checkbox" />
            {t('customersTemplate')}
          </label>
          <Button type="submit">{t('newProject')}</Button>
        </form>
      }
    >
      {projects.isLoading ? <LoadingBlock /> : null}
      {projects.isError ? <ErrorState message={(projects.error as Error).message} /> : null}
      {projects.data && projects.data.projects.length === 0 ? <EmptyState title={t('emptyProjects')} body={t('emptyProjectsBody')} /> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {projects.data?.projects.map((project) => (
          <Link
            key={project.id}
            to={`/projects/${project.id}`}
            onContextMenu={(event) => openMenu(event, [
              { id: 'open', label: t('open'), onSelect: () => navigate(`/projects/${project.id}`) },
              { id: 'rename', label: t('rename'), onSelect: () => setRename(project) },
              { id: 'delete', label: t('delete'), danger: true, onSelect: () => setRemove(project) },
            ])}
          >
            <Card className="min-h-24 p-4 hover:bg-accent">{project.name}</Card>
          </Link>
        ))}
      </div>
      <PromptDialog
        open={Boolean(rename)}
        title={t('rename')}
        label={t('name')}
        value={rename?.name ?? ''}
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
      className="min-h-16 w-full resize-y bg-transparent text-sm text-muted-foreground outline-none"
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

export function ProjectPage() {
  const { projectId = '' } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const openMenu = useContextMenu()
  const queryClient = useQueryClient()
  const [rename, setRename] = useState<TableRecord | null>(null)
  const [remove, setRemove] = useState<TableRecord | null>(null)
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => api.request<{ project: Project }>(`/projects/${projectId}`) })
  const tables = useQuery({ queryKey: ['tables', projectId], queryFn: () => api.request<{ tables: TableRecord[] }>(`/projects/${projectId}/tables`) })
  const members = useQuery({ queryKey: ['members', projectId], queryFn: () => api.request<{ members: { userId: string; username: string }[] }>(`/projects/${projectId}/members`) })
  if (project.isLoading || tables.isLoading) return <Page title={t('projects')}><LoadingBlock /></Page>
  if (project.isError) return <Page title={t('projects')}><ErrorState message={(project.error as Error).message} /></Page>
  return (
    <Page
      title={project.data?.project.name ?? t('projects')}
      actions={
        <Button
          type="button"
          onClick={async () => {
            const created = await api.request<{ table: TableRecord }>(`/projects/${projectId}/tables`, { method: 'POST', body: JSON.stringify({}) })
            await queryClient.invalidateQueries({ queryKey: ['tables', projectId] })
            navigate(`/projects/${projectId}/tables/${created.table.id}`, { state: { focusName: true } })
          }}
        >
          {t('newTable')}
        </Button>
      }
    >
      <ProjectDescription projectId={projectId} value={project.data?.project.description ?? ''} />
      {tables.data?.tables.length === 0 ? <EmptyState title={t('emptyTables')} body={t('emptyTablesBody')} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {tables.data?.tables.map((table) => (
          <Link
            key={table.id}
            to={`/projects/${projectId}/tables/${table.id}`}
            onContextMenu={(event) => openMenu(event, [
              { id: 'open', label: t('open'), onSelect: () => navigate(`/projects/${projectId}/tables/${table.id}`) },
              { id: 'rename', label: t('rename'), onSelect: () => setRename(table) },
              { id: 'delete', label: t('delete'), danger: true, onSelect: () => setRemove(table) },
            ])}
          >
            <Card className="min-h-20 p-4 hover:bg-accent">{table.name}</Card>
          </Link>
        ))}
      </div>
      <PromptDialog
        open={Boolean(rename)}
        title={t('rename')}
        label={t('name')}
        value={rename?.name ?? ''}
        onClose={() => setRename(null)}
        onSubmit={(next) => {
          if (!rename) return
          void api.request(`/tables/${rename.id}`, { method: 'PATCH', body: JSON.stringify({ name: next }) }).then(() => queryClient.invalidateQueries({ queryKey: ['tables', projectId] }))
          setRename(null)
        }}
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
          void api.request(`/tables/${remove.id}`, { method: 'DELETE' }).then(() => queryClient.invalidateQueries({ queryKey: ['tables', projectId] }))
          setRemove(null)
        }}
      />
      <Card className="p-4">
        <h2 className="font-medium">{t('members')}</h2>
        <ul className="mt-2 min-h-8 text-sm">
          {members.data?.members.map((member) => <li key={member.userId}>{member.username}</li>)}
        </ul>
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault()
            const form = event.currentTarget
            const data = new FormData(form)
            await api.request(`/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify({ username: data.get('username') }) })
            await queryClient.invalidateQueries({ queryKey: ['members', projectId] })
            form.reset()
          }}
        >
          <Input name="username" placeholder={t('username')} className="max-w-xs" required />
          <Button type="submit" variant="outline">{t('addMember')}</Button>
        </form>
      </Card>
    </Page>
  )
}

export function TablePage() {
  const { tableId = '' } = useParams()
  return <TableScreen tableId={tableId} />
}

export function RecentPage() {
  const { t } = useTranslation()
  const recents = useQuery({ queryKey: ['recents'], queryFn: () => api.request<{ recents: { id: string; resourceType: string; resourceId: string }[] }>('/recents') })
  return (
    <Page title={t('recent')}>
      {recents.isLoading ? <LoadingBlock /> : null}
      {recents.data?.recents.length === 0 ? <EmptyState title={t('recentEmpty')} body={t('recentEmpty')} /> : null}
      <ul className="flex flex-col gap-2">
        {recents.data?.recents.map((item) => (
          <li key={item.id}><Card className="p-3 text-sm">{item.resourceType}</Card></li>
        ))}
      </ul>
    </Page>
  )
}

export function FavoritesPage() {
  const { t } = useTranslation()
  const favorites = useQuery({ queryKey: ['favorites'], queryFn: () => api.request<{ favorites: { resourceType: string; resourceId: string }[] }>('/favorites') })
  return (
    <Page title={t('favorites')}>
      {favorites.isLoading ? <LoadingBlock /> : null}
      {favorites.data?.favorites.length === 0 ? <EmptyState title={t('favoritesEmpty')} body={t('favoritesEmpty')} /> : null}
      <ul className="flex flex-col gap-2">
        {favorites.data?.favorites.map((item) => (
          <li key={item.resourceId}><Card className="p-3 text-sm">{item.resourceType}</Card></li>
        ))}
      </ul>
    </Page>
  )
}

export function IntegrationsPage() {
  const { t } = useTranslation()
  const plugins = useQuery({ queryKey: ['plugins'], queryFn: () => api.request<{ plugins: { id: string; name: string; enabled: boolean }[] }>('/plugins') })
  return (
    <Page title={t('integrations')}>
      {plugins.isLoading ? <LoadingBlock /> : null}
      {plugins.isError ? <ErrorState message={(plugins.error as Error).message} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {plugins.data?.plugins.map((plugin) => (
          <Card key={plugin.id} className="flex min-h-24 items-center justify-between p-4">
            <div>
              <p className="font-medium">{plugin.name}</p>
              <p className="text-sm text-muted-foreground">{plugin.enabled ? t('enabled') : t('disabled')}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => api.request(`/plugins/${plugin.id}/${plugin.enabled ? 'disable' : 'enable'}`, { method: 'POST' }).then(() => plugins.refetch())}
            >
              {plugin.enabled ? t('disable') : t('enable')}
            </Button>
          </Card>
        ))}
      </div>
    </Page>
  )
}

export function UsersPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.request<{ users: User[] }>('/users') })
  return (
    <Page
      title={t('users')}
      actions={
        <form
          className="flex flex-wrap gap-2"
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
                role: data.get('role'),
              }),
            })
            await queryClient.invalidateQueries({ queryKey: ['users'] })
            form.reset()
          }}
        >
          <Input name="username" required placeholder={t('username')} className="w-32" />
          <Input name="email" type="email" required placeholder={t('email')} className="w-44" />
          <Input name="password" type="password" required minLength={12} placeholder={t('password')} className="w-40" />
          <select name="role" className="h-9 rounded-md border border-border bg-card px-2 text-sm" aria-label={t('role')}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <Button type="submit">{t('create')}</Button>
        </form>
      }
    >
      {users.isLoading ? <LoadingBlock /> : null}
      {users.isError ? <ErrorState message={(users.error as Error).message} /> : null}
      <div className="overflow-hidden rounded-md border border-border">
        {users.data?.users.map((user) => (
          <div key={user.id} className="flex min-h-12 items-center justify-between border-b border-border px-3 text-sm last:border-b-0">
            <span>{user.username} · {user.email}</span>
            <span className="text-muted-foreground">{user.role}</span>
          </div>
        ))}
      </div>
    </Page>
  )
}

export function ApiKeysPage() {
  const { t } = useTranslation()
  const [created, setCreated] = useState('')
  const keys = useQuery({ queryKey: ['api-keys'], queryFn: () => api.request<{ apiKeys: { id: string; name: string; prefix: string; revokedAt: string | null }[] }>('/api-keys') })
  return (
    <Page title={t('apiKeys')}>
      <form
        className="flex gap-2"
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
      {created ? <Card className="p-3 text-sm">{t('keyOnce')}<p className="mt-2 font-mono">{created}</p></Card> : null}
      {keys.isLoading ? <LoadingBlock /> : null}
      {keys.data?.apiKeys.map((key) => (
        <Card key={key.id} className="flex items-center justify-between p-3 text-sm">
          <span>{key.name} · {key.prefix}</span>
          <Button variant="outline" onClick={() => api.request(`/api-keys/${key.id}`, { method: 'DELETE' }).then(() => keys.refetch())}>{t('revoke')}</Button>
        </Card>
      ))}
    </Page>
  )
}

export function AuditPage() {
  const { t } = useTranslation()
  const audit = useQuery({ queryKey: ['audit'], queryFn: () => api.request<{ entries: { id: string; action: string; createdAt: string }[] }>('/audit') })
  return (
    <Page title={t('audit')}>
      {audit.isLoading ? <LoadingBlock /> : null}
      {audit.isError ? <ErrorState message={(audit.error as Error).message} /> : null}
      <div className="rounded-md border border-border">
        {audit.data?.entries.map((entry) => (
          <div key={entry.id} className="flex min-h-10 items-center justify-between border-b border-border px-3 text-sm last:border-b-0">
            <span>{entry.action}</span>
            <span className="text-muted-foreground">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))}</span>
          </div>
        ))}
      </div>
    </Page>
  )
}

export function ProfilePage() {
  const { t, i18n } = useTranslation()
  const user = useSession((state) => state.user)
  const setUser = useSession((state) => state.setUser)
  if (!user) return <Page title={t('profile')}><LoadingBlock /></Page>
  return (
    <Page title={t('profile')}>
      <nav className="flex min-h-9 gap-2 text-sm">
        <NavLink to="/settings/users" className="rounded-md px-2 py-1 hover:bg-accent">{t('users')}</NavLink>
        <NavLink to="/settings/api-keys" className="rounded-md px-2 py-1 hover:bg-accent">{t('apiKeys')}</NavLink>
        <NavLink to="/settings/audit" className="rounded-md px-2 py-1 hover:bg-accent">{t('audit')}</NavLink>
      </nav>
      <form
        className="grid max-w-md gap-3"
        onSubmit={async (event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          const locale = String(data.get('locale'))
          const theme = String(data.get('theme')) as 'light' | 'dark' | 'system'
          const result = await api.request<{ user: User }>(`/users/${user.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ locale, timezone: data.get('timezone'), theme }),
          })
          setUser(result.user)
          await i18n.changeLanguage(locale)
          localStorage.setItem('locale', locale)
          applyTheme(theme)
        }}
      >
        <Label htmlFor="locale">{t('language')}</Label>
        <select id="locale" name="locale" defaultValue={user.locale} className="h-9 rounded-md border border-border bg-card px-2 text-sm">
          <option value="en">English</option>
          <option value="de">Deutsch</option>
        </select>
        <Label htmlFor="theme">{t('theme')}</Label>
        <select id="theme" name="theme" defaultValue={user.theme} className="h-9 rounded-md border border-border bg-card px-2 text-sm">
          <option value="system">{t('system')}</option>
          <option value="light">{t('light')}</option>
          <option value="dark">{t('dark')}</option>
        </select>
        <Label htmlFor="timezone">Timezone</Label>
        <Input id="timezone" name="timezone" defaultValue={user.timezone} />
        <Button type="submit">{t('save')}</Button>
      </form>
      <Card className="max-w-md p-4">
        <h2 className="font-medium">{t('totp')}</h2>
        <Button
          className="mt-3"
          variant="outline"
          onClick={async () => {
            const enrolled = await api.request<{ secret: string; url: string }>('/totp/enroll', { method: 'POST' })
            window.alert(`${enrolled.secret}\n${enrolled.url}`)
          }}
        >
          {t('enroll')}
        </Button>
      </Card>
    </Page>
  )
}
