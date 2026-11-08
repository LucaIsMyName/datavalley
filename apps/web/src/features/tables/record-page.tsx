import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaFile, RowRecord, TableRecord } from '@datavalley/api-client'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { ChevronRightIcon } from 'lucide-react'
import { ErrorState, LoadingBlock } from '../../components/states'
import { api } from '../../lib/api'
import { uploadMedia } from '../../lib/media'
import { sync } from '../../lib/sync'
import { useFormulaWindow } from '../../stores/formula-window'
import { MediaLibraryDialog } from '../media/media-library-dialog'
import { MediaPreviewDrawer } from '../media/media-preview-drawer'
import { applyStashedNotes } from '../realtime/apply'
import { setNotesEditing, takeStashedNotes } from '../realtime/editing'
import { reportPresence } from '../realtime/presence-store'
import { mapCachedRows, patchCachedTable, readCachedRow } from './cache'
import { mergeMediaIntoCell } from './media-cell'
import { NotesBlockEditor } from './notes'
import { NotesRowFields } from './notes-row-fields'
import { RecordMail } from './record-mail'
import { RecordPrivacy } from './record-privacy'
import { mergeColumnOption } from './select-options-utils'
import { isTableReadOnly, tableReadOnlyReason } from './table-read-only'
import { useRowCellEdit } from './use-row-cell-edit'

type RecordLink = {
  tableId: string
  tableName: string
  rowId: string
  title: string
  columnName: string
}

type RecordPayload = {
  row: RowRecord
  tableId: string
  links: RecordLink[]
}

type RecordCache = {
  pages: { rows: RowRecord[]; nextCursor: string | null }[]
  pageParams: unknown[]
  links: RecordLink[]
}

function recordTitle(table: TableRecord | undefined, row: RowRecord | undefined) {
  if (!row) return ''
  const column = table?.columns?.find((item) => item.type === 'text' || item.type === 'mail')
  const value = column ? row.cells[column.id] : null
  if (typeof value === 'string' && value.trim()) return value
  return `#${row.rowNumber}`
}

export function RecordPage() {
  const { projectId = '', tableId = '', rowId = '' } = useParams()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const uploadRef = useRef<HTMLInputElement>(null)
  const uploadTarget = useRef<{ rowId: string; columnId: string } | null>(null)
  const [mediaLibrary, setMediaLibrary] = useState<{ rowId: string; columnId: string; existingIds: string[] } | null>(null)
  const [mediaPreview, setMediaPreview] = useState<{ file: MediaFile; rowId: string; columnId: string } | null>(null)
  const [mediaUploadingKey, setMediaUploadingKey] = useState<string | null>(null)
  const notesFocused = useRef(false)
  const notesBaseline = useRef('')
  const tableQuery = useQuery({
    queryKey: ['table', tableId],
    queryFn: () => api.request<{ table: TableRecord }>(`/tables/${tableId}`),
  })
  const projectTables = useQuery({
    queryKey: ['tables', projectId],
    enabled: Boolean(projectId),
    queryFn: () => api.request<{ tables: TableRecord[] }>(`/projects/${projectId}/tables`),
  })
  const membersQuery = useQuery({
    queryKey: ['members', projectId],
    queryFn: () =>
      api.request<{ members: { userId: string; username: string }[] }>(`/projects/${projectId}/members`),
  })
  const recordQuery = useQuery({
    queryKey: ['rows', tableId, 'record', rowId],
    queryFn: async () => {
      const result = await api.request<RecordPayload>(`/rows/${rowId}/record`)
      const cache: RecordCache = {
        pages: [{ rows: [result.row], nextCursor: null }],
        pageParams: [null],
        links: result.links,
      }
      return cache
    },
  })
  const table = tableQuery.data?.table
  const cache = recordQuery.data
  const row = cache?.pages[0]?.rows.find((item) => item.id === rowId) ?? readCachedRow(queryClient, tableId, rowId)
  const history = useQuery({
    queryKey: ['history', rowId, row?.version ?? 0],
    enabled: Boolean(rowId),
    queryFn: () =>
      api.request<{
        entries: {
          id: string
          columnName: string
          actorName: string | null
          before: string
          after: string
          createdAt: string
        }[]
      }>(`/rows/${rowId}/history`),
  })
  const quote = useQuery({
    queryKey: ['quote', rowId],
    enabled: Boolean(rowId),
    retry: false,
    queryFn: () =>
      api.request<{ title: string }>(`/rows/${rowId}/quote`),
  })
  const readOnly = isTableReadOnly(table)
  const cellEdit = useRowCellEdit({
    tableId,
    readOnly,
    readOnlyReason: tableReadOnlyReason(table),
    getRow: (id) => readCachedRow(queryClient, tableId, id) ?? (row?.id === id ? row : undefined),
  })
  const [notes, setNotes] = useState(row?.notes ?? '')

  useEffect(() => {
    if (notesFocused.current) return
    setNotes(row?.notes ?? '')
    notesBaseline.current = row?.notes ?? ''
  }, [row?.id, row?.notes])

  function scheduleNotes(next: string) {
    if (!row || readOnly) return
    reportPresence({
      tableId,
      focus: { kind: 'notes', tableId, rowId: row.id },
      editing: true,
      draft: next,
    })
    const version = row.version
    sync.edit(`row:${row.id}:notes`, {
      draft: next,
      delay: 300,
      apply: () => undefined,
      commit: async (draft) => {
        const current = readCachedRow(queryClient, tableId, row.id)
        const result = await api.request<{ row: RowRecord }>(`/rows/${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ version: current?.version ?? version, cells: {}, notes: draft }),
        })
        return result.row
      },
      accept: (saved) => {
        takeStashedNotes(saved.id)
        notesBaseline.current = saved.notes
        mapCachedRows(queryClient, tableId, (item) =>
          item.id === saved.id ? { ...item, notes: saved.notes, version: saved.version } : item,
        )
      },
      rollback: () => setNotes(notesBaseline.current),
    })
  }

  if (tableQuery.isLoading || recordQuery.isLoading) return <LoadingBlock variant="rows" />
  if (tableQuery.isError || recordQuery.isError || !table || !row) {
    const message =
      (tableQuery.error as Error | null)?.message ??
      (recordQuery.error as Error | null)?.message ??
      t('error')
    return <ErrorState message={message} />
  }

  const columns = table.columns ?? []
  const title = recordTitle(table, row)

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 overflow-auto p-3 sm:p-4 md:p-6 border-t border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-1">
          <Link to={`/projects/${projectId}/tables/${tableId}`} className="text-xl text-primary hover:underline max-w-48 truncate ">
            {table.name}
          </Link>
          <ChevronRightIcon className="size-4" />
          <h1 className="truncate text-xl font-semibold">{title}</h1>
        </div>
        {quote.data ? (
          <Link
            to={`/projects/${projectId}/tables/${tableId}/rows/${rowId}/print`}
            className="inline-flex h-9 items-center border border-border px-3 text-sm"
          >
            {t('printQuote')}
          </Link>
        ) : null}
      </div>
      <NotesRowFields
        tableId={tableId}
        row={row}
        columns={columns}
        tags={table.tags ?? []}
        statuses={table.statuses ?? []}
        members={membersQuery.data?.members ?? []}
        readOnly={readOnly}
        cellEdit={cellEdit}
        onMediaLibrary={(targetRowId, columnId, existingIds) =>
          setMediaLibrary({ rowId: targetRowId, columnId, existingIds })
        }
        onMediaPreview={(file, targetRowId, columnId) => setMediaPreview({ file, rowId: targetRowId, columnId })}
        onMediaRequestUpload={(targetRowId, columnId) => {
          uploadTarget.current = { rowId: targetRowId, columnId }
          uploadRef.current?.click()
        }}
        mediaUploadingKey={mediaUploadingKey}
        onDateMode={(column, patch) => {
          const config = { ...column.config, ...patch }
          patchCachedTable(queryClient, tableId, (current) => ({
            ...current,
            columns: current.columns?.map((item) => (item.id === column.id ? { ...item, config } : item)),
          }))
          void api.request(`/columns/${column.id}`, { method: 'PATCH', body: JSON.stringify({ config }) })
        }}
        onCreated={(kind, item) =>
          patchCachedTable(queryClient, tableId, (current) => ({
            ...current,
            tags: kind === 'tag' ? [...(current.tags ?? []).filter((tag) => tag.id !== item.id), item] : current.tags,
            statuses:
              kind === 'status'
                ? [...(current.statuses ?? []).filter((status) => status.id !== item.id), item]
                : current.statuses,
          }))
        }
        onOptionChange={(columnId, option, deleted) => {
          patchCachedTable(queryClient, tableId, (current) => ({
            ...current,
            columns: current.columns?.map((item) =>
              item.id === columnId ? mergeColumnOption(item, option, deleted) : item,
            ),
          }))
        }}
        onOpenFormula={(targetRowId, columnId, columnName) =>
          useFormulaWindow.getState().open({
            tableId,
            projectId,
            tableName: table.name,
            rowId: targetRowId,
            columnId,
            columnName,
          })
        }
        tables={projectTables.data?.tables ?? []}
      />
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">{t('linkedRecords')}</h2>
        {cache?.links.length ? (
          <ul className="flex w-full gap-2">
            {cache.links.map((link) => (
              <li key={`${link.tableId}:${link.rowId}:${link.columnName}`} className="border border-border">
                <Link
                  to={`/projects/${projectId}/tables/${link.tableId}/rows/${link.rowId}`}
                  className="flex  min-w-0 gap-0.5 px-2 py-1.5 text-sm sm:gap-2"
                >
                  <span className="text-muted-foreground col-span-1">{link.columnName || link.tableName}</span>
                  <span className="min-w-0 truncate font-medium col-span-2">{link.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('linkedRecordsEmpty')}</p>
        )}
      </section>
      <RecordMail rowId={row.id} readOnly={readOnly} />
      <RecordPrivacy projectId={projectId} tableId={tableId} rowId={row.id} title={title} />
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">{t('fieldHistory')}</h2>
        {history.isLoading && !history.data ? <LoadingBlock variant="rows" /> : null}
        {history.data && history.data.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('fieldHistoryEmpty')}</p>
        ) : null}
        {history.data && history.data.entries.length > 0 ? (
          <ul className="flex flex-col">
            {history.data.entries.map((entry) => (
              <li key={entry.id} className="flex min-h-11 min-w-0 flex-col justify-center gap-0.5 border-t border-border py-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{entry.actorName ?? t('fieldHistorySomeone')}</span>
                  {' · '}
                  {entry.columnName}
                </span>
                <span className="min-w-0 truncate text-muted-foreground">
                  {entry.before || t('empty')}
                  {' → '}
                  {entry.after || t('empty')}
                  {' · '}
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <section className="flex min-h-40 flex-col gap-2">
        <h2 className="text-sm font-medium">{t('notes')}</h2>
        <NotesBlockEditor
          rowId={row.id}
          markdown={notes}
          readOnly={readOnly}
          onChange={(next) => {
            setNotes(next)
            scheduleNotes(next)
          }}
          onFocusChange={(focused) => {
            notesFocused.current = focused
            setNotesEditing(row.id, focused)
            if (focused) {
              reportPresence({
                tableId,
                focus: { kind: 'notes', tableId, rowId: row.id },
                editing: true,
              })
              return
            }
            void sync.flush(`row:${row.id}:notes`).finally(() => {
              if (!sync.has(`row:${row.id}:notes`)) applyStashedNotes(queryClient, tableId, row.id)
              reportPresence({ focus: null, editing: false, draft: null })
            })
          }}
        />
      </section>
      <input
        ref={uploadRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          const target = uploadTarget.current
          event.target.value = ''
          if (!file || !target) return
          const column = columns.find((item) => item.id === target.columnId)
          const current = readCachedRow(queryClient, tableId, target.rowId) ?? row
          if (!column) return
          setMediaUploadingKey(`${target.rowId}:${target.columnId}`)
          void uploadMedia(file, { tableId })
            .then((saved) => cellEdit.applyMediaCell(current, column, mergeMediaIntoCell(current.cells[column.id], [saved.id])))
            .finally(() => setMediaUploadingKey(null))
        }}
      />
      <MediaLibraryDialog
        open={Boolean(mediaLibrary)}
        onClose={() => setMediaLibrary(null)}
        existingIds={mediaLibrary?.existingIds ?? []}
        onInsert={(added) => {
          if (!mediaLibrary) return
          const column = columns.find((item) => item.id === mediaLibrary.columnId)
          const current = readCachedRow(queryClient, tableId, mediaLibrary.rowId) ?? row
          if (!column) return
          void cellEdit.applyMediaCell(current, column, mergeMediaIntoCell(current.cells[column.id], added)).then(
            () => setMediaLibrary(null),
          )
        }}
      />
      <MediaPreviewDrawer
        file={mediaPreview?.file ?? null}
        onClose={() => setMediaPreview(null)}
        onDisconnect={
          mediaPreview
            ? () => {
                const column = columns.find((item) => item.id === mediaPreview.columnId)
                const current = readCachedRow(queryClient, tableId, mediaPreview.rowId) ?? row
                if (!column) return
                const ids = (current.cells[column.id] as { fileIds?: string[] } | null)?.fileIds ?? []
                const next = ids.filter((id) => id !== mediaPreview.file.id)
                void cellEdit
                  .applyMediaCell(current, column, next.length ? { fileIds: next } : null)
                  .then(() => setMediaPreview(null))
              }
            : undefined
        }
      />
      <Link
        to={`/projects/${projectId}/tables/${tableId}`}
        className="inline-flex h-9 items-center self-start border border-border px-3 text-sm"
      >
        {t('backToTable')}
      </Link>
    </div>
  )
}
