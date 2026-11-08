import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { ConfirmDialog } from '../../components/confirm-dialog'
import { Button } from '../../components/ui/button'
import { api } from '../../lib/api'
import { toast } from 'sonner'

export function RecordPrivacy({
  projectId,
  tableId,
  rowId,
  title,
}: {
  projectId: string
  tableId: string
  rowId: string
  title: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  async function download() {
    try {
      const data = await api.request<unknown>(`/rows/${rowId}/privacy`)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${title || 'record'}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('error'))
    }
  }

  async function remove() {
    setPending(true)
    try {
      const result = await api.request<{ removed: boolean; connector: boolean }>(`/rows/${rowId}/privacy`, {
        method: 'DELETE',
      })
      setOpen(false)
      if (result.connector) {
        toast.success(t('privacyKept'))
        return
      }
      navigate(`/projects/${projectId}/tables/${tableId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('error'))
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{t('privacy')}</h2>
      <p className="text-sm text-muted-foreground">{t('privacyHint')}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void download()}>
          {t('privacyExport')}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(true)}>
          {t('privacyRemove')}
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        title={t('privacyRemove')}
        body={t('privacyRemoveWarning', { name: title })}
        confirmLabel={t('privacyRemove')}
        cancelLabel={t('cancel')}
        pending={pending}
        onConfirm={() => void remove()}
        onClose={() => setOpen(false)}
      />
    </section>
  )
}
