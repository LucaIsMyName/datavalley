import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, useNavigate, useParams } from 'react-router'
import { ApiClientError, type Project, type TableRecord, type User } from '@datavalley/api-client'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { EmptyState, ErrorState, LoadingBlock, Page } from '../components/states'
import { TableGrid } from './tables/grid'
import { api } from '../lib/api'
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
  const queryClient = useQueryClient()
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
          <Link key={project.id} to={`/projects/${project.id}`}>
            <Card className="min-h-24 p-4 hover:bg-accent">{project.name}</Card>
          </Link>
        ))}
      </div>
    </Page>
  )
}

export function ProjectPage() {
  const { projectId = '' } = useParams()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => api.request<{ project: Project }>(`/projects/${projectId}`) })
  const tables = useQuery({ queryKey: ['tables', projectId], queryFn: () => api.request<{ tables: TableRecord[] }>(`/projects/${projectId}/tables`) })
  const members = useQuery({ queryKey: ['members', projectId], queryFn: () => api.request<{ members: { userId: string; username: string }[] }>(`/projects/${projectId}/members`) })
  if (project.isLoading || tables.isLoading) return <Page title={t('projects')}><LoadingBlock /></Page>
  if (project.isError) return <Page title={t('projects')}><ErrorState message={(project.error as Error).message} /></Page>
  return (
    <Page
      title={project.data?.project.name ?? t('projects')}
      actions={
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            await api.request(`/projects/${projectId}/tables`, { method: 'POST', body: JSON.stringify({ name: data.get('name') }) })
            await queryClient.invalidateQueries({ queryKey: ['tables', projectId] })
            event.currentTarget.reset()
          }}
        >
          <Input name="name" required placeholder={t('name')} className="w-48" />
          <Button type="submit">{t('addTable')}</Button>
        </form>
      }
    >
      {tables.data?.tables.length === 0 ? <EmptyState title={t('emptyTables')} body={t('emptyTablesBody')} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {tables.data?.tables.map((table) => (
          <Link key={table.id} to={`/projects/${projectId}/tables/${table.id}`}>
            <Card className="min-h-20 p-4 hover:bg-accent">{table.name}</Card>
          </Link>
        ))}
      </div>
      <Card className="p-4">
        <h2 className="font-medium">{t('members')}</h2>
        <ul className="mt-2 min-h-8 text-sm">
          {members.data?.members.map((member) => <li key={member.userId}>{member.username}</li>)}
        </ul>
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            await api.request(`/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify({ username: data.get('username') }) })
            await queryClient.invalidateQueries({ queryKey: ['members', projectId] })
            event.currentTarget.reset()
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
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const table = useQuery({ queryKey: ['table', tableId], queryFn: () => api.request<{ table: TableRecord }>(`/tables/${tableId}`) })
  if (table.isLoading) return <Page title={t('projects')}><LoadingBlock /></Page>
  if (table.isError || !table.data) return <Page title={t('projects')}><ErrorState message={(table.error as Error)?.message ?? t('error')} /></Page>
  const current = table.data.table
  return (
    <Page
      title={current.name}
      actions={
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            await api.request(`/tables/${tableId}/columns`, { method: 'POST', body: JSON.stringify({ name: data.get('name'), type: data.get('type') }) })
            await queryClient.invalidateQueries({ queryKey: ['table', tableId] })
            event.currentTarget.reset()
          }}
        >
          <Input name="name" required placeholder={t('name')} className="w-40" />
          <select name="type" className="h-9 rounded-md border border-border bg-card px-2 text-sm" defaultValue="text" aria-label={t('addColumn')}>
            {['text', 'long_text', 'number', 'date', 'checkbox', 'select', 'url', 'currency'].map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
          <Button type="submit">{t('addColumn')}</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => api.request(`/favorites`, { method: 'POST', body: JSON.stringify({ resourceType: 'table', resourceId: tableId }) })}
          >
            {t('favorites')}
          </Button>
        </form>
      }
    >
      <TableGrid tableId={tableId} columns={current.columns ?? []} />
    </Page>
  )
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
            const data = new FormData(event.currentTarget)
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
            event.currentTarget.reset()
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
