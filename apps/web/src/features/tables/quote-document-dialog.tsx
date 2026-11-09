import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Column, TableRecord } from '@datavalley/api-client'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppDialog } from '../../components/ui/app-dialog'
import { Button } from '../../components/ui/button'
import { SelectField } from '../../components/ui/select'
import { api } from '../../lib/api'
import { toast } from 'sonner'
import { patchCachedTable } from './cache'

const NONE = 'none'
const textTypes = new Set(['text', 'long_text', 'mail', 'url'])
const statusTypes = new Set(['select', 'radio', 'status'])
const numberTypes = new Set(['number', 'currency'])

type Draft = {
  linesTableId: string
  quoteColumnId: string
  productColumnId: string
  quantityColumnId: string
  priceColumnId: string
  customerColumnId: string
  statusColumnId: string
}

const emptyDraft: Draft = {
  linesTableId: NONE,
  quoteColumnId: NONE,
  productColumnId: NONE,
  quantityColumnId: NONE,
  priceColumnId: NONE,
  customerColumnId: NONE,
  statusColumnId: NONE,
}

export function QuoteDocumentDialog({
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
  const projectId = table.data?.table.projectId ?? ''
  const projectTables = useQuery({
    queryKey: ['tables', projectId],
    enabled: open && Boolean(projectId),
    queryFn: () => api.request<{ tables: TableRecord[] }>(`/projects/${projectId}/tables`),
  })
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  useEffect(() => {
    if (!open) return
    setDraft(draftFrom(table.data?.table.documentConfig))
  }, [open, table.data?.table.documentConfig])

  const lines = useQuery({
    queryKey: ['table', draft.linesTableId],
    enabled: open && draft.linesTableId !== NONE,
    queryFn: () => api.request<{ table: TableRecord }>(`/tables/${draft.linesTableId}`),
  })
  const lineColumns = lines.data?.table.columns ?? []
  const productColumn = lineColumns.find((column) => column.id === draft.productColumnId)
  const productTableId = textValue(productColumn?.config.toTableId)
  const productTable = useQuery({
    queryKey: ['table', productTableId],
    enabled: open && Boolean(productTableId) && productTableId !== draft.linesTableId,
    queryFn: () => api.request<{ table: TableRecord }>(`/tables/${productTableId}`),
  })

  const save = useMutation({
    mutationFn: (documentConfig: Record<string, unknown>) =>
      api.request<{ table: TableRecord }>(`/tables/${tableId}`, {
        method: 'PATCH',
        body: JSON.stringify({ documentConfig }),
      }),
    onSuccess: (result) => {
      patchCachedTable(queryClient, tableId, (current) => ({
        ...current,
        documentConfig: result.table.documentConfig,
      }))
      toast.success(
        Object.keys(result.table.documentConfig).length === 0
          ? t('quoteDocumentCleared')
          : t('quoteDocumentSaved'),
      )
      onClose()
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('error')),
  })

  const ownColumns = table.data?.table.columns ?? []
  const quoteColumns = lineColumns.filter(
    (column) => column.type === 'relation' && textValue(column.config.toTableId) === tableId,
  )
  const productColumns = lineColumns.filter((column) => column.type === 'relation')
  const quantityColumns = lineColumns.filter((column) => column.type === 'number')
  const priceColumns = [
    ...lineColumns
      .filter((column) => numberTypes.has(column.type))
      .map((column) => ({ value: column.id, label: column.name })),
    ...(productTable.data?.table.columns ?? [])
      .filter((column) => numberTypes.has(column.type))
      .map((column) => ({
        value: column.id,
        label: `${productTable.data?.table.name ?? ''} · ${column.name}`,
      })),
  ]
  const configured = table.data?.table.documentConfig.kind === 'quote'
  const ready =
    draft.linesTableId !== NONE &&
    draft.quoteColumnId !== NONE &&
    draft.productColumnId !== NONE &&
    draft.quantityColumnId !== NONE &&
    draft.priceColumnId !== NONE

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={t('quoteDocument')}
      description={t('quoteDocumentHint')}
    >
      <div className="mt-3 flex max-h-[60vh] flex-col gap-3 overflow-auto">
        <Field
          label={t('quoteLinesTable')}
          value={draft.linesTableId}
          options={withCurrent(
            [
              { value: NONE, label: t('none') },
              ...(projectTables.data?.tables ?? []).map((item) => ({
                value: item.id,
                label: item.name,
              })),
            ],
            draft.linesTableId,
          )}
          onValueChange={(value) =>
            setDraft((current) => ({
              ...emptyDraft,
              customerColumnId: current.customerColumnId,
              statusColumnId: current.statusColumnId,
              linesTableId: value,
            }))
          }
        />
        <Field
          label={t('quoteColumn')}
          value={draft.quoteColumnId}
          options={columnOptions(quoteColumns, draft.quoteColumnId, t('none'))}
          onValueChange={(value) => setDraft((current) => ({ ...current, quoteColumnId: value }))}
        />
        <Field
          label={t('quoteProductColumn')}
          value={draft.productColumnId}
          options={columnOptions(productColumns, draft.productColumnId, t('none'))}
          onValueChange={(value) =>
            setDraft((current) => ({
              ...current,
              productColumnId: value,
              priceColumnId: value === current.productColumnId ? current.priceColumnId : NONE,
            }))
          }
        />
        <Field
          label={t('quoteQuantityColumn')}
          value={draft.quantityColumnId}
          options={columnOptions(quantityColumns, draft.quantityColumnId, t('none'))}
          onValueChange={(value) =>
            setDraft((current) => ({ ...current, quantityColumnId: value }))
          }
        />
        <Field
          label={t('quotePriceColumn')}
          value={draft.priceColumnId}
          options={withCurrent(
            [{ value: NONE, label: t('none') }, ...priceColumns],
            draft.priceColumnId,
          )}
          onValueChange={(value) => setDraft((current) => ({ ...current, priceColumnId: value }))}
        />
        <Field
          label={t('quoteCustomerColumn')}
          value={draft.customerColumnId}
          options={columnOptions(
            ownColumns.filter((column) => textTypes.has(column.type)),
            draft.customerColumnId,
            t('none'),
          )}
          onValueChange={(value) =>
            setDraft((current) => ({ ...current, customerColumnId: value }))
          }
        />
        <Field
          label={t('quoteStatusColumn')}
          value={draft.statusColumnId}
          options={columnOptions(
            ownColumns.filter((column) => statusTypes.has(column.type)),
            draft.statusColumnId,
            t('none'),
          )}
          onValueChange={(value) => setDraft((current) => ({ ...current, statusColumnId: value }))}
        />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {configured ? (
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending}
            onClick={() => save.mutate({})}
          >
            {t('quoteDocumentClear')}
          </Button>
        ) : null}
        <Button
          type="button"
          disabled={!ready || save.isPending}
          onClick={() => {
            if (!ready) {
              toast.error(t('quoteDocumentIncomplete'))
              return
            }
            save.mutate({
              kind: 'quote',
              linesTableId: draft.linesTableId,
              quoteColumnId: draft.quoteColumnId,
              productColumnId: draft.productColumnId,
              quantityColumnId: draft.quantityColumnId,
              priceColumnId: draft.priceColumnId,
              ...(draft.customerColumnId !== NONE
                ? { customerColumnId: draft.customerColumnId }
                : {}),
              ...(draft.statusColumnId !== NONE ? { statusColumnId: draft.statusColumnId } : {}),
            })
          }}
        >
          {t('save')}
        </Button>
      </div>
    </AppDialog>
  )
}

function Field({
  label,
  value,
  options,
  onValueChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onValueChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm">{label}</span>
      <SelectField label={label} value={value} options={options} onValueChange={onValueChange} />
    </div>
  )
}

function columnOptions(columns: Column[], current: string, none: string) {
  return withCurrent(
    [
      { value: NONE, label: none },
      ...columns.map((column) => ({ value: column.id, label: column.name })),
    ],
    current,
  )
}

function withCurrent(options: { value: string; label: string }[], current: string) {
  if (options.some((option) => option.value === current)) return options
  return [...options, { value: current, label: '…' }]
}

function draftFrom(config: Record<string, unknown> | undefined): Draft {
  if (!config || config.kind !== 'quote') return emptyDraft
  return {
    linesTableId: textValue(config.linesTableId) || NONE,
    quoteColumnId: textValue(config.quoteColumnId) || NONE,
    productColumnId: textValue(config.productColumnId) || NONE,
    quantityColumnId: textValue(config.quantityColumnId) || NONE,
    priceColumnId: textValue(config.priceColumnId) || NONE,
    customerColumnId: textValue(config.customerColumnId) || NONE,
    statusColumnId: textValue(config.statusColumnId) || NONE,
  }
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}
