import { applyMailPlaceholders } from '@datavalley/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { LoadingBlock } from '../../components/states'
import { api } from '../../lib/api'

type MailTemplate = { id: string; name: string; subject: string; body: string }
type MailRecipient = { address: string; label: string; rowId: string }
type MailMessage = {
  id: string
  to: string
  subject: string
  body: string
  actorName: string | null
  createdAt: string
  relatedRowId: string | null
}

const fieldClass =
  'h-9 w-full border border-border bg-card px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

export function RecordMail({ rowId, readOnly }: { rowId: string; readOnly: boolean }) {
  const { t } = useTranslation()
  const mail = useQuery({
    queryKey: ['row-mail', rowId],
    queryFn: () =>
      api.request<{ fields: Record<string, string>; recipients: MailRecipient[]; messages: MailMessage[] }>(
        `/rows/${rowId}/mail`,
      ),
  })
  const templates = useQuery({
    queryKey: ['mail-templates'],
    queryFn: () => api.request<{ templates: MailTemplate[] }>('/mail/templates'),
  })
  return (
    <section className="flex flex-col gap-2">
      {mail.isLoading && !mail.data ? <LoadingBlock variant="rows" /> : null}
      {mail.data && mail.data.messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('mailLogEmpty')}</p>
      ) : null}
      {mail.data && mail.data.messages.length > 0 ? (
        <ul className="flex flex-col">
          {mail.data.messages.map((message) => (
            <li key={message.id} className="flex min-h-11 min-w-0 flex-col justify-center gap-0.5 border-t border-border py-2 text-sm">
              <span className="min-w-0 truncate font-medium">{message.subject}</span>
              {message.body ? <span className="min-w-0 truncate text-muted-foreground">{message.body}</span> : null}
              <span className="min-w-0 truncate text-muted-foreground">
                {message.to}
                {' · '}
                {message.actorName ?? t('fieldHistorySomeone')}
                {' · '}
                {new Date(message.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {mail.data && !readOnly ? (
        <MailCompose
          key={rowId}
          rowId={rowId}
          fields={mail.data.fields}
          recipients={mail.data.recipients}
          templates={templates.data?.templates ?? []}
        />
      ) : null}
    </section>
  )
}

export function MailCompose({
  rowId,
  fields,
  recipients,
  templates,
}: {
  rowId: string
  fields: Record<string, string>
  recipients: MailRecipient[]
  templates: MailTemplate[]
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [templateId, setTemplateId] = useState('')
  const [to, setTo] = useState(recipients[0]?.address ?? '')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const preview = applyMailPlaceholders(subject, fields)

  async function send() {
    setPending(true)
    setError('')
    try {
      await api.request(`/rows/${rowId}/mail`, {
        method: 'POST',
        body: JSON.stringify({
          to,
          subject,
          body,
          templateId: templateId || null,
        }),
      })
      setSubject('')
      setBody('')
      setTemplateId('')
      toast.success(t('mailSent'))
      await queryClient.invalidateQueries({ queryKey: ['row-mail', rowId] })
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-2 border-t border-border pt-3"
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <Label>{t('mailTemplate')}</Label>
          <select
            aria-label={t('mailTemplate')}
            className={fieldClass}
            value={templateId}
            onChange={(event) => {
              const next = event.target.value
              setTemplateId(next)
              const template = templates.find((item) => item.id === next)
              if (!template) return
              setSubject(template.subject)
              setBody(template.body)
            }}
          >
            <option value="">{t('mailNoTemplate')}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <Label>{t('mailTo')}</Label>
          {recipients.length > 0 ? (
            <select aria-label={t('mailTo')} className={fieldClass} value={to} onChange={(event) => setTo(event.target.value)}>
              {recipients.map((item) => (
                <option key={`${item.rowId}:${item.address}`} value={item.address}>
                  {item.label} ({item.address})
                </option>
              ))}
            </select>
          ) : (
            <Input aria-label={t('mailTo')} value={to} onChange={(event) => setTo(event.target.value)} />
          )}
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <Label>{t('mailSubject')}</Label>
        <Input aria-label={t('mailSubject')} value={subject} onChange={(event) => setSubject(event.target.value)} />
      </label>
      {preview !== subject ? <p className="truncate text-sm text-muted-foreground">{preview}</p> : null}
      <label className="flex flex-col gap-1">
        <Label>{t('mailBody')}</Label>
        <textarea
          aria-label={t('mailBody')}
          className="min-h-24 w-full border border-border bg-card px-3 py-2 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="self-start" disabled={pending || !to.trim() || !subject.trim()}>
        {t('mailSend')}
      </Button>
    </form>
  )
}
