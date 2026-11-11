import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ConfirmDialog } from '../../components/confirm-dialog'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { ErrorState, LoadingBlock, Page } from '../../components/states'
import { api } from '../../lib/api'

type MailTemplate = { id: string; name: string; subject: string; body: string }

export function MailTemplatesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const templates = useQuery({
    queryKey: ['mail-templates'],
    queryFn: () => api.request<{ templates: MailTemplate[] }>('/mail/templates'),
  })
  const [draft, setDraft] = useState<MailTemplate | null>(null)
  const [editing, setEditing] = useState(false)
  const [removeId, setRemoveId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const rows = templates.data?.templates ?? []
  const removing = rows.find((item) => item.id === removeId)

  function openNew() {
    setDraft({ id: '', name: '', subject: '', body: '' })
    setEditing(true)
    setError('')
  }

  function openEdit(template: MailTemplate) {
    setDraft({ ...template })
    setEditing(true)
    setError('')
  }

  function closeEditor() {
    setEditing(false)
    setDraft(null)
    setError('')
  }

  async function save() {
    if (!draft || !draft.name.trim()) return
    setPending(true)
    setError('')
    try {
      const payload = { name: draft.name, subject: draft.subject, body: draft.body }
      if (draft.id) {
        await api.request(`/mail/templates/${draft.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      } else {
        await api.request('/mail/templates', { method: 'POST', body: JSON.stringify(payload) })
      }
      toast.success(t('mailSaved'))
      await queryClient.invalidateQueries({ queryKey: ['mail-templates'] })
      closeEditor()
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    if (!removeId) return
    setPending(true)
    try {
      await api.request(`/mail/templates/${removeId}`, { method: 'DELETE' })
      toast.success(t('mailDeleted'))
      setRemoveId(null)
      await queryClient.invalidateQueries({ queryKey: ['mail-templates'] })
    } catch (caught) {
      toast.error((caught as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Page
      title={t('mailTemplates')}
      actions={
        editing ? null : (
          <Button type="button" onClick={openNew}>
            {t('mailTemplateNew')}
          </Button>
        )
      }
    >
      <p className="text-sm text-muted-foreground">{t('mailPlaceholders')}</p>
      {templates.isLoading ? <LoadingBlock /> : null}
      {templates.isError ? (
        <ErrorState message={(templates.error as Error).message} onRetry={() => void templates.refetch()} />
      ) : null}
      {templates.data && !editing ? (
        rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('mailTemplatesEmpty')}</p>
        ) : (
          <div className="min-w-0 overflow-auto border border-border">
            <table className="table-grid w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="h-10 px-2 text-left font-medium">{t('name')}</th>
                  <th className="h-10 px-2 text-left font-medium">{t('mailSubject')}</th>
                  <th className="h-10 w-40 px-2 text-left font-medium">
                    <span className="sr-only">{t('edit')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((template) => (
                  <tr key={template.id} className="border-t border-border">
                    <td className="h-11 max-w-0 px-2">
                      <span className="block truncate font-medium">{template.name}</span>
                    </td>
                    <td className="h-11 max-w-0 px-2">
                      <span className="block truncate text-muted-foreground">{template.subject}</span>
                    </td>
                    <td className="h-11 px-2">
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => openEdit(template)}>
                          {t('edit')}
                        </Button>
                        <Button type="button" variant="outline" onClick={() => setRemoveId(template.id)}>
                          {t('delete')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
      {editing && draft ? (
        <form
          className="flex max-w-xl flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <label className="flex flex-col gap-1">
            <Label>{t('name')}</Label>
            <Input
              aria-label={t('name')}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <Label>{t('mailSubject')}</Label>
            <Input
              aria-label={t('mailSubject')}
              value={draft.subject}
              onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <Label>{t('mailBody')}</Label>
            <textarea
              aria-label={t('mailBody')}
              className="min-h-32 w-full border border-border bg-card px-3 py-2 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              value={draft.body}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
            />
          </label>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || !draft.name.trim()}>
              {t('save')}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={closeEditor}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      ) : null}
      <ConfirmDialog
        open={Boolean(removing)}
        title={t('delete')}
        body={t('mailDeleteWarning', { name: removing?.name ?? '' })}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        pending={pending}
        onConfirm={() => void remove()}
        onClose={() => setRemoveId(null)}
      />
    </Page>
  )
}
