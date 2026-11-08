import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { LoadingBlock, Page } from '../../components/states'
import { api } from '../../lib/api'

type MailTemplate = { id: string; name: string; subject: string; body: string }

export function MailTemplatesPage() {
  const { t } = useTranslation()
  const templates = useQuery({
    queryKey: ['mail-templates'],
    queryFn: () => api.request<{ templates: MailTemplate[] }>('/mail/templates'),
  })
  return (
    <Page title={t('mailTemplates')}>
      <p className="text-sm text-muted-foreground">{t('mailPlaceholders')}</p>
      {templates.isLoading ? <LoadingBlock /> : null}
      {templates.data ? <TemplateEditor templates={templates.data.templates} /> : null}
    </Page>
  )
}

function TemplateEditor({ templates }: { templates: MailTemplate[] }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState(templates[0]?.id ?? '')
  const current = templates.find((item) => item.id === selected)
  const [name, setName] = useState(current?.name ?? '')
  const [subject, setSubject] = useState(current?.subject ?? '')
  const [body, setBody] = useState(current?.body ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  function load(id: string) {
    setSelected(id)
    const next = templates.find((item) => item.id === id)
    setName(next?.name ?? '')
    setSubject(next?.subject ?? '')
    setBody(next?.body ?? '')
    setError('')
  }

  async function save() {
    setPending(true)
    setError('')
    try {
      const payload = { name, subject, body }
      const saved = selected
        ? await api.request<{ template: MailTemplate }>(`/mail/templates/${selected}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          })
        : await api.request<{ template: MailTemplate }>('/mail/templates', {
            method: 'POST',
            body: JSON.stringify(payload),
          })
      toast.success(t('mailSaved'))
      await queryClient.invalidateQueries({ queryKey: ['mail-templates'] })
      setSelected(saved.template.id)
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    if (!selected) return
    setPending(true)
    setError('')
    try {
      await api.request(`/mail/templates/${selected}`, { method: 'DELETE' })
      toast.success(t('mailDeleted'))
      setSelected('')
      setName('')
      setSubject('')
      setBody('')
      await queryClient.invalidateQueries({ queryKey: ['mail-templates'] })
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="flex max-w-xl flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <label className="flex flex-col gap-1">
        <Label>{t('mailTemplate')}</Label>
        <select
          aria-label={t('mailTemplate')}
          className="h-9 w-full border border-border bg-card px-3 text-sm"
          value={selected}
          onChange={(event) => load(event.target.value)}
        >
          <option value="">{t('mailTemplateNew')}</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <Label>{t('name')}</Label>
        <Input aria-label={t('name')} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <Label>{t('mailSubject')}</Label>
        <Input aria-label={t('mailSubject')} value={subject} onChange={(event) => setSubject(event.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <Label>{t('mailBody')}</Label>
        <textarea
          aria-label={t('mailBody')}
          className="min-h-32 w-full border border-border bg-card px-3 py-2 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !name.trim()}>
          {t('save')}
        </Button>
        {selected ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => void remove()}>
            {t('delete')}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
