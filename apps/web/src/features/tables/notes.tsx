import * as Dialog from '@radix-ui/react-dialog'
import { useQueryClient } from '@tanstack/react-query'
import type { RowRecord } from '@datavalley/api-client'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Markdown from 'react-markdown'
import { api } from '../../lib/api'
import { sync } from '../../lib/sync'
import { mapCachedRows, readCachedRow } from './cache'

export function NotesDrawer({
  tableId,
  row,
  onClose,
}: {
  tableId: string
  row: RowRecord | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [text, setText] = useState(row?.notes ?? '')
  const [preview, setPreview] = useState(false)
  const focused = useRef(false)
  const baseline = useRef(row?.notes ?? '')

  useEffect(() => {
    if (focused.current) return
    setText(row?.notes ?? '')
    baseline.current = row?.notes ?? ''
  }, [row?.id, row?.notes])

  function schedule(next: string) {
    if (!row) return
    const rowId = row.id
    const version = row.version
    sync.edit(`row:${rowId}:notes`, {
      draft: next,
      delay: 300,
      apply: (draft) => mapCachedRows(queryClient, tableId, (item) => (item.id === rowId ? { ...item, notes: String(draft) } : item)),
      commit: async (draft) => {
        const current = readCachedRow(queryClient, tableId, rowId)
        const result = await api.request<{ row: RowRecord }>(`/rows/${rowId}`, {
          method: 'PATCH',
          body: JSON.stringify({ version: current?.version ?? version, cells: {}, notes: draft }),
        })
        return result.row
      },
      accept: (saved) => {
        baseline.current = saved.notes
        mapCachedRows(queryClient, tableId, (item) => (item.id === saved.id ? { ...item, notes: saved.notes, version: saved.version } : item))
      },
      rollback: () => {
        setText(baseline.current)
        mapCachedRows(queryClient, tableId, (item) => (item.id === rowId ? { ...item, notes: baseline.current } : item))
      },
    })
  }

  return (
    <Dialog.Root open={Boolean(row)} onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/20" />
        <Dialog.Content className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col gap-3 border-l border-border bg-card p-4 shadow-lg">
          <Dialog.Title className="text-lg font-semibold">{t('notes')}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('notes')}</Dialog.Description>
          <div className="flex gap-2">
            <button type="button" className={`rounded px-2 py-1 text-sm ${preview ? '' : 'bg-accent'}`} onClick={() => setPreview(false)}>{t('notes')}</button>
            <button type="button" className={`rounded px-2 py-1 text-sm ${preview ? 'bg-accent' : ''}`} onClick={() => setPreview(true)}>{t('preview')}</button>
          </div>
          {preview ? (
            <div className="min-h-40 flex-1 overflow-auto text-sm leading-6">
              <Markdown>{text}</Markdown>
            </div>
          ) : (
            <textarea
              aria-label={t('notes')}
              className="min-h-40 flex-1 resize-none rounded-md border border-border bg-transparent p-2 text-sm outline-none"
              value={text}
              onFocus={() => { focused.current = true }}
              onChange={(event) => { setText(event.target.value); schedule(event.target.value) }}
              onBlur={() => {
                focused.current = false
                if (row) void sync.flush(`row:${row.id}:notes`)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  if (row) sync.cancel(`row:${row.id}:notes`)
                  setText(baseline.current)
                }
              }}
            />
          )}
          <Dialog.Close className="self-end rounded-md border border-border px-3 py-1.5 text-sm">{t('cancel')}</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
