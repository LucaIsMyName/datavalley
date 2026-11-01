import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiClientError, type User } from '@datavalley/api-client'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/card'
import { ConfirmDialog } from '../../components/confirm-dialog'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../components/ui/select'
import { EmptyState, ErrorState, LoadingBlock, Page } from '../../components/states'
import { api } from '../../lib/api'

export function UsersPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [role, setRole] = useState('user')
  const [createError, setCreateError] = useState('')
  const [createPending, setCreatePending] = useState(false)
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api.request<{ users: User[] }>('/users'),
  })
  return (
    <Page
      title={t('users')}
      actions={
        <Button
          type="button"
          onClick={() => {
            setCreateError('')
            setRole('user')
            setCreating(true)
          }}
        >
          {t('create')}
        </Button>
      }
    >
      <Dialog.Root
        open={creating}
        onOpenChange={(open) => {
          if (!open) setCreating(false)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 border border-border bg-card p-4 shadow-md">
            <Dialog.Title className="text-base font-semibold">{t('create')}</Dialog.Title>
            <Dialog.Description className="sr-only">{t('users')}</Dialog.Description>
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
                      role,
                    }),
                  })
                  await queryClient.invalidateQueries({ queryKey: ['users'] })
                  setCreating(false)
                  setRole('user')
                  event.currentTarget.reset()
                } catch (caught) {
                  setCreateError(
                    caught instanceof ApiClientError
                      ? caught.message
                      : caught instanceof Error
                        ? caught.message
                        : t('error'),
                  )
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
                <Select value={role} onValueChange={setRole}>
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
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {users.isLoading ? <LoadingBlock /> : null}
      {users.isError ? <ErrorState message={(users.error as Error).message} /> : null}
      {users.data && users.data.users.length === 0 ? (
        <EmptyState title={t('emptyUsers')} body={t('emptyUsers')} />
      ) : null}
      <div className="overflow-hidden border border-border">
        {users.data?.users.map((user) => (
          <div
            key={user.id}
            className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-3 text-sm last:border-b-0"
          >
            <span className="min-w-0 truncate">
              {user.username} · {user.email}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {user.role === 'admin' ? t('roleAdmin') : t('roleUser')}
            </span>
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
          const data = new FormData(event.currentTarget)
          const result = await api.request<{ apiKey: { key: string } }>('/api-keys', {
            method: 'POST',
            body: JSON.stringify({ name: data.get('name'), scopes: [] }),
          })
          setCreated(result.apiKey.key)
          await keys.refetch()
        }}
      >
        <Input name="name" required placeholder={t('name')} className="max-w-xs" />
        <Button type="submit">{t('createKey')}</Button>
      </form>
      {created ? (
        <Card className="min-h-20 p-3 text-sm">
          {t('keyOnce')}
          <p className="mt-2 font-mono break-all">{created}</p>
        </Card>
      ) : (
        <div className="min-h-0" />
      )}
      {keys.isLoading ? <LoadingBlock /> : null}
      {keys.data && keys.data.apiKeys.length === 0 ? (
        <EmptyState title={t('emptyApiKeys')} body={t('emptyApiKeys')} />
      ) : null}
      {keys.data?.apiKeys.map((key) => (
        <Card
          key={key.id}
          className="flex flex-col items-start justify-between gap-2 p-3 text-sm sm:flex-row sm:items-center"
        >
          <span>
            {key.name} · {key.prefix}
          </span>
          <Button variant="outline" onClick={() => setRevoke({ id: key.id, name: key.name })}>
            {t('revoke')}
          </Button>
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
  const audit = useQuery({
    queryKey: ['audit'],
    queryFn: () =>
      api.request<{ entries: { id: string; action: string; createdAt: string }[] }>('/audit'),
  })
  return (
    <Page title={t('audit')}>
      {audit.isLoading ? <LoadingBlock /> : null}
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
