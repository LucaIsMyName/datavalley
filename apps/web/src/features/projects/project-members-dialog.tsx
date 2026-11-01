import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiClientError } from '@datavalley/api-client'
import { ConfirmDialog } from '../../components/confirm-dialog'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { LoadingBlock } from '../../components/states'
import { api } from '../../lib/api'

export function ProjectMembersDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [memberName, setMemberName] = useState('')
  const [memberError, setMemberError] = useState('')
  const [dropMember, setDropMember] = useState<{ userId: string; username: string } | null>(null)
  const members = useQuery({
    queryKey: ['members', projectId],
    enabled: open,
    queryFn: () =>
      api.request<{
        members: {
          userId: string
          username: string
          email: string
          role: string
          disabled: boolean
        }[]
        canManage: boolean
      }>(`/projects/${projectId}/members`),
  })
  const directory = useQuery({
    queryKey: ['directory', projectId, memberName],
    enabled: open,
    queryFn: () =>
      api.request<{ users: { id: string; username: string; email: string }[] }>(
        `/projects/${projectId}/directory?q=${encodeURIComponent(memberName)}`,
      ),
  })

  return (
    <>
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next)
          if (!next) {
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
              <Dialog.Close className="border border-border px-3 py-1.5 text-sm">
                {t('close')}
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">{t('members')}</Dialog.Description>
            <ul className="mt-3 min-h-8 text-sm">
              {members.isLoading ? (
                <li>
                  <LoadingBlock />
                </li>
              ) : null}
              {members.data && members.data.members.length === 0 ? (
                <li className="text-muted-foreground">{t('emptyMembers')}</li>
              ) : null}
              {members.data?.members.map((member) => {
                const roster = members.data?.members ?? []
                const activeAdmins = roster.filter(
                  (item) => item.role === 'admin' && !item.disabled,
                ).length
                const lastAdmin = member.role === 'admin' && !member.disabled && activeAdmins <= 1
                return (
                  <li
                    key={member.userId}
                    className="flex min-h-11 flex-wrap items-center gap-2 py-1"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{member.username}</span>
                      <span className="block truncate text-muted-foreground">{member.email}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {member.role === 'admin' ? t('roleAdmin') : t('roleUser')}
                    </span>
                    {member.disabled ? (
                      <span className="shrink-0 text-muted-foreground">{t('disabled')}</span>
                    ) : null}
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
                            void api
                              .request(`/projects/${projectId}/members/${member.userId}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ disabled: !member.disabled }),
                              })
                              .then(() =>
                                queryClient.invalidateQueries({ queryKey: ['members', projectId] }),
                              )
                              .catch((error: unknown) =>
                                setMemberError(
                                  error instanceof ApiClientError ? error.message : t('error'),
                                ),
                              )
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
            {memberError ? (
              <p role="alert" className="mt-2 text-sm text-danger">
                {memberError}
              </p>
            ) : null}
            <form
              className="mt-3"
              onSubmit={async (event) => {
                event.preventDefault()
                const username = memberName.trim()
                if (!username) return
                setMemberError('')
                try {
                  await api.request(`/projects/${projectId}/members`, {
                    method: 'POST',
                    body: JSON.stringify({ username }),
                  })
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
                <Button type="submit" variant="outline" className="shrink-0 whitespace-nowrap">
                  {t('addMember')}
                </Button>
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
          void api
            .request(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' })
            .then(() => queryClient.invalidateQueries({ queryKey: ['members', projectId] }))
            .then(() => queryClient.invalidateQueries({ queryKey: ['directory', projectId] }))
            .catch((error: unknown) =>
              setMemberError(error instanceof ApiClientError ? error.message : t('error')),
            )
        }}
      />
    </>
  )
}
