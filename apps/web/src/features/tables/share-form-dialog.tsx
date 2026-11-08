import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Column, TableRecord } from '@datavalley/api-client'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppDialog } from '../../components/ui/app-dialog'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { api } from '../../lib/api'
import { toast } from 'sonner'

const publicTypes = new Set(['text', 'long_text', 'mail', 'url', 'number', 'date', 'checkbox', 'select'])

export function ShareFormDialog({
  tableId,
  open,
  onClose,
}: {
  tableId: string
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const table = useQuery({
    queryKey: ['table', tableId],
    enabled: open,
    queryFn: () => api.request<{ table: TableRecord }>(`/tables/${tableId}`),
  })
  const form = useQuery({
    queryKey: ['form', tableId],
    enabled: open,
    retry: false,
    queryFn: () => api.request<{ form: { token: string; columnIds: string[] } | null }>(`/tables/${tableId}/form`),
  })
  const columns = (table.data?.table.columns ?? []).filter((column) => publicTypes.has(column.type))
  const [selected, setSelected] = useState<string[]>([])
  useEffect(() => {
    if (!open) return
    setSelected(form.data?.form?.columnIds ?? [])
  }, [open, form.data?.form?.columnIds])

  const save = useMutation({
    mutationFn: (columnIds: string[]) =>
      api.request<{ form: { token: string; columnIds: string[] } }>(`/tables/${tableId}/form`, {
        method: 'PUT',
        body: JSON.stringify({ columnIds }),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(['form', tableId], result)
      toast.success(t('shareFormSaved'))
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('error')),
  })
  const remove = useMutation({
    mutationFn: () => api.request(`/tables/${tableId}/form`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.setQueryData(['form', tableId], { form: null })
      setSelected([])
      toast.success(t('shareFormRemoved'))
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('error')),
  })
  const token = form.data?.form?.token
  const link = token ? `${window.location.origin}/forms/${token}` : ''

  return (
    <AppDialog open={open} onOpenChange={(next) => { if (!next) onClose() }} title={t('shareForm')} description={t('shareFormHint')}>
      {form.isError ? <p className="mt-3 text-sm text-danger">{t('shareFormDenied')}</p> : null}
      <ul className="mt-3 flex max-h-64 flex-col gap-2 overflow-auto">
        {columns.map((column: Column) => (
          <li key={column.id}>
            <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={selected.includes(column.id)}
                onCheckedChange={(next) =>
                  setSelected((current) =>
                    next === true ? [...current, column.id] : current.filter((id) => id !== column.id),
                  )
                }
              />
              <span className="min-w-0 truncate">{column.name}</span>
            </label>
          </li>
        ))}
      </ul>
      {link ? (
        <p className="mt-3 break-all text-sm">
          <a href={link} className="text-primary underline" target="_blank" rel="noreferrer">
            {link}
          </a>
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        {token ? (
          <Button type="button" variant="outline" disabled={remove.isPending} onClick={() => remove.mutate()}>
            {t('shareFormRemove')}
          </Button>
        ) : null}
        <Button
          type="button"
          disabled={selected.length === 0 || save.isPending || form.isError}
          onClick={() => save.mutate(selected)}
        >
          {t('save')}
        </Button>
      </div>
    </AppDialog>
  )
}
