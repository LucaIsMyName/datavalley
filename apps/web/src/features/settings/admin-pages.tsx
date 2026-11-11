import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ApiClientError, type User } from '@datavalley/api-client'
import { ConfirmDialog } from '../../components/confirm-dialog'
import { AppDialog } from '../../components/ui/app-dialog'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../components/ui/select'
import { EmptyState, ErrorState, LoadingBlock, Page } from '../../components/states'
import { api } from '../../lib/api'
import { useSession } from '../../stores/session'

function errorMessage(caught: unknown, fallback: string) {
  return caught instanceof ApiClientError || caught instanceof Error ? caught.message : fallback
}

export function UsersPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const currentUser = useSession((state) => state.user)
  const setCurrentUser = useSession((state) => state.setUser)
  const [creating, setCreating] = useState(false)
  const [createRole, setCreateRole] = useState('user')
  const [createError, setCreateError] = useState('')
  const [createPending, setCreatePending] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [editRole, setEditRole] = useState('user')
  const [editError, setEditError] = useState('')
  const [editPending, setEditPending] = useState(false)
  const [deleting, setDeleting] = useState<User | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api.request<{ users: User[] }>('/users'),
  })
  const roster = users.data?.users ?? []
  const activeAdmins = roster.filter((item) => item.role === 'admin' && !item.disabled).length

  function openEdit(user: User) {
    setEditError('')
    setEditRole(user.role)
    setEditing(user)
  }

  return (
    <Page
      title={t('users')}
      actions={
        <Button
          type="button"
          onClick={() => {
            setCreateError('')
            setCreateRole('user')
            setCreating(true)
          }}
        >
          {t('create')}
        </Button>
      }
    >
      <AppDialog
        open={creating}
        title={t('create')}
        onOpenChange={(open) => {
          if (!open) setCreating(false)
        }}
      >
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            setCreateError('')
            setCreatePending(true)
            try {
              await api.request('/users', {
                method: 'POST',
                body: JSON.stringify({
                  username: data.get('username'),
                  email: data.get('email'),
                  password: data.get('password'),
                  role: createRole,
                }),
              })
              await queryClient.invalidateQueries({ queryKey: ['users'] })
              setCreating(false)
              setCreateRole('user')
              event.currentTarget.reset()
            } catch (caught) {
              setCreateError(errorMessage(caught, t('error')))
            } finally {
              setCreatePending(false)
            }
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="new-username">{t('username')}</Label>
            <Input id="new-username" name="username" autoFocus required />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="new-email">{t('email')}</Label>
            <Input id="new-email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="new-password">{t('password')}</Label>
            <Input
              id="new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="new-role">{t('role')}</Label>
            <Select value={createRole} onValueChange={setCreateRole}>
              <SelectTrigger id="new-role" aria-label={t('role')} />
              <SelectContent>
                <SelectItem value="user">{t('roleUser')}</SelectItem>
                <SelectItem value="admin">{t('roleAdmin')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {createError ? (
            <p role="alert" className="text-sm text-danger">
              {createError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreating(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={createPending}>
              {t('create')}
            </Button>
          </div>
        </form>
      </AppDialog>
      <AppDialog
        open={Boolean(editing)}
        title={t('editUser')}
        className="max-h-[min(36rem,calc(100vh-2rem))] overflow-auto"
        onOpenChange={(open) => {
          if (!open && !editPending) setEditing(null)
        }}
      >
        {editing ? (
          <form
            key={editing.id}
            className="mt-3 flex flex-col gap-3"
            onSubmit={async (event) => {
              event.preventDefault()
              if (!editing || editPending) return
              const data = new FormData(event.currentTarget)
              const password = String(data.get('password') ?? '')
              setEditError('')
              setEditPending(true)
              try {
                const result = await api.request<{ user: User }>(`/users/${editing.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({
                    username: data.get('username'),
                    email: data.get('email'),
                    role: editRole,
                  }),
                })
                if (password) {
                  await api.request(`/users/${editing.id}/reset-password`, {
                    method: 'POST',
                    body: JSON.stringify({ password }),
                  })
                }
                await queryClient.invalidateQueries({ queryKey: ['users'] })
                if (currentUser?.id === result.user.id) setCurrentUser(result.user)
                setEditing(null)
              } catch (caught) {
                setEditError(errorMessage(caught, t('error')))
              } finally {
                setEditPending(false)
              }
            }}
          >
            <div className="grid gap-1">
              <Label htmlFor="edit-username">{t('username')}</Label>
              <Input id="edit-username" name="username" defaultValue={editing.username} autoFocus required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="edit-email">{t('email')}</Label>
              <Input
                id="edit-email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={editing.email}
                required
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="edit-password">{t('newPassword')}</Label>
              <Input
                id="edit-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                placeholder={t('optionalPassword')}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="edit-role">{t('role')}</Label>
              <Select
                value={editRole}
                onValueChange={setEditRole}
                disabled={editing.role === 'admin' && !editing.disabled && activeAdmins <= 1}
              >
                <SelectTrigger
                  id="edit-role"
                  aria-label={t('role')}
                  title={
                    editing.role === 'admin' && !editing.disabled && activeAdmins <= 1
                      ? t('lastAdminHint')
                      : undefined
                  }
                />
                <SelectContent>
                  <SelectItem value="user">{t('roleUser')}</SelectItem>
                  <SelectItem value="admin">{t('roleAdmin')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editError ? (
              <p role="alert" className="text-sm text-danger">
                {editError}
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="mr-auto"
                disabled={editPending || (editing.role === 'admin' && !editing.disabled && activeAdmins <= 1)}
                title={
                  editing.role === 'admin' && !editing.disabled && activeAdmins <= 1 ? t('lastAdminHint') : undefined
                }
                onClick={() => {
                  if (!editing || editPending) return
                  const path = editing.disabled ? 'enable' : 'disable'
                  setEditError('')
                  setEditPending(true)
                  void api
                    .request<{ user: User }>(`/users/${editing.id}/${path}`, { method: 'POST' })
                    .then(async (result) => {
                      await queryClient.invalidateQueries({ queryKey: ['users'] })
                      setEditing(result.user)
                      setEditRole(result.user.role)
                      if (currentUser?.id === result.user.id) setCurrentUser(result.user)
                    })
                    .catch((caught: unknown) => {
                      setEditError(errorMessage(caught, t('error')))
                    })
                    .finally(() => setEditPending(false))
                }}
              >
                {editing.disabled ? t('enable') : t('disable')}
              </Button>
              <Button type="button" variant="outline" disabled={editPending} onClick={() => setEditing(null)}>
                {t('cancel')}
              </Button>
              <Button type="submit" disabled={editPending}>
                {t('save')}
              </Button>
            </div>
          </form>
        ) : null}
      </AppDialog>
      {users.isLoading ? <LoadingBlock variant="rows" /> : null}
      {users.isError ? <ErrorState message={(users.error as Error).message} /> : null}
      {users.data && users.data.users.length === 0 ? (
        <EmptyState title={t('emptyUsers')} body={t('emptyUsers')} />
      ) : null}
      <div className="overflow-hidden border border-border">
        {roster.map((user) => {
          const lastAdmin = user.role === 'admin' && !user.disabled && activeAdmins <= 1
          return (
            <div
              key={user.id}
              className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0"
            >
              <span className="min-w-0 truncate">
                {user.username} · {user.email}
                {user.disabled ? ` · ${t('disabled')}` : ''}
              </span>
              <span className="flex shrink-0 flex-wrap items-center gap-2">
                <span className="text-muted-foreground">
                  {user.role === 'admin' ? t('roleAdmin') : t('roleUser')}
                </span>
                <Button type="button" variant="outline" onClick={() => openEdit(user)}>
                  {t('edit')}
                </Button>
                {currentUser?.id === user.id ? null : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={lastAdmin}
                    title={lastAdmin ? t('lastAdminHint') : undefined}
                    onClick={() => setDeleting(user)}
                  >
                    {t('delete')}
                  </Button>
                )}
              </span>
            </div>
          )
        })}
      </div>
      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('deleteUserTitle')}
        body={t('deleteUserWarning', { name: deleting?.username ?? '' })}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        pending={deletePending}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting || deletePending) return
          const id = deleting.id
          setDeletePending(true)
          void api
            .request(`/users/${id}`, { method: 'DELETE' })
            .then(() => queryClient.invalidateQueries({ queryKey: ['users'] }))
            .then(() => setDeleting(null))
            .catch((caught: unknown) => {
              toast.error(errorMessage(caught, t('error')))
            })
            .finally(() => setDeletePending(false))
        }}
      />
    </Page>
  )
}

export function ApiKeysPage() {
  const { t } = useTranslation()
  const [created, setCreated] = useState('')
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<{ id: string; name: string; kind: 'revoke' | 'delete' } | null>(null)
  const [confirmPending, setConfirmPending] = useState(false)
  const keys = useQuery({
    queryKey: ['api-keys'],
    queryFn: () =>
      api.request<{
        apiKeys: { id: string; name: string; prefix: string; revokedAt: string | null }[]
      }>('/api-keys'),
  })
  return (
    <Page title={t('apiKeys')}>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={async (event) => {
          event.preventDefault()
          if (creating) return
          const form = event.currentTarget
          const data = new FormData(form)
          setCreateError('')
          setCreating(true)
          try {
            const result = await api.request<{ apiKey: { key: string } }>('/api-keys', {
              method: 'POST',
              body: JSON.stringify({ name: data.get('name'), scopes: [] }),
            })
            setCreated(result.apiKey.key)
            form.reset()
            await keys.refetch()
          } catch (error) {
            const message = error instanceof Error ? error.message : t('error')
            setCreateError(message)
            toast.error(message)
          } finally {
            setCreating(false)
          }
        }}
      >
        <Label className="sr-only" htmlFor="api-key-name">
          {t('name')}
        </Label>
        <Input
          id="api-key-name"
          name="name"
          required
          placeholder={t('name')}
          aria-label={t('name')}
          className="max-w-xs w-full max-w-full flex-1"
        />
        <Button type="submit" disabled={creating} aria-busy={creating}>
          {t('createKey')}
        </Button>
      </form>
      {createError ? (
        <p role="alert" className="text-sm text-danger">
          {createError}
        </p>
      ) : null}
      {created ? (
        <div className="min-h-20 py-3 text-sm">
          {t('keyOnce')}
          <p className="mt-2 font-mono break-all">{created}</p>
        </div>
      ) : (
        <div className="min-h-0" />
      )}
      {keys.isLoading ? <LoadingBlock variant="rows" /> : null}
      {keys.isError ? <ErrorState message={(keys.error as Error).message} onRetry={() => void keys.refetch()} /> : null}
      {keys.data && keys.data.apiKeys.length === 0 ? (
        <EmptyState title={t('emptyApiKeys')} body={t('emptyApiKeys')} />
      ) : null}
      {keys.data && keys.data.apiKeys.length > 0 ? (
        <div className="min-w-0 overflow-auto border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="h-10 border-r border-border px-2 text-left font-medium">{t('name')}</th>
                <th className="h-10 border-r border-border px-2 text-left font-medium">{t('prefix')}</th>
                <th className="h-10 px-2 text-left font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {keys.data.apiKeys.map((key) => (
                <tr key={key.id} className="border-b border-border last:border-b-0">
                  <td className="h-11 border-r border-border px-2">
                    <span className="font-medium">{key.name}</span>
                    {key.revokedAt ? <span className="ml-2 text-muted-foreground">{t('revoked')}</span> : null}
                  </td>
                  <td className="h-11 border-r border-border px-2">
                    <code className="font-mono text-muted-foreground">{key.prefix}...</code>
                  </td>
                  <td className="h-11 px-2">
                    <div className="flex flex-wrap gap-2">
                      {key.revokedAt ? null : (
                        <Button variant="outline" onClick={() => setConfirm({ id: key.id, name: key.name, kind: 'revoke' })}>
                          {t('revoke')}
                        </Button>
                      )}
                      <Button variant="outline" onClick={() => setConfirm({ id: key.id, name: key.name, kind: 'delete' })}>
                        {t('delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === 'delete' ? t('deleteKeyTitle') : t('revokeKeyTitle')}
        body={
          confirm?.kind === 'delete'
            ? t('deleteKeyWarning', { name: confirm?.name ?? '' })
            : t('revokeKeyWarning', { name: confirm?.name ?? '' })
        }
        confirmLabel={confirm?.kind === 'delete' ? t('delete') : t('revoke')}
        cancelLabel={t('cancel')}
        pending={confirmPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm || confirmPending) return
          const { id, kind } = confirm
          setConfirmPending(true)
          void api
            .request(kind === 'delete' ? `/api-keys/${id}` : `/api-keys/${id}/revoke`, {
              method: kind === 'delete' ? 'DELETE' : 'POST',
            })
            .then(() => keys.refetch())
            .then(() => setConfirm(null))
            .catch((error: unknown) => {
              toast.error(error instanceof Error ? error.message : t('error'))
            })
            .finally(() => setConfirmPending(false))
        }}
      />
    </Page>
  )
}

export function AuditPage() {
  const { t } = useTranslation()
  const audit = useQuery({
    queryKey: ['audit'],
    queryFn: () =>
      api.request<{ entries: { id: string; action: string; createdAt: string }[] }>('/audit'),
  })
  return (
    <Page title={t('audit')}>
      {audit.isLoading ? <LoadingBlock variant="table" /> : null}
      {audit.isError ? <ErrorState message={(audit.error as Error).message} /> : null}
      {audit.data && audit.data.entries.length === 0 ? (
        <EmptyState title={t('emptyAudit')} body={t('emptyAudit')} />
      ) : null}
      <div className="border border-border">
        {audit.data?.entries.map((entry) => (
          <div
            key={entry.id}
            className="flex min-h-10 flex-col gap-1 border-b border-border px-3 py-2 text-sm last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>{entry.action}</span>
            <span className="text-muted-foreground">
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(entry.createdAt))}
            </span>
          </div>
        ))}
      </div>
    </Page>
  )
}
