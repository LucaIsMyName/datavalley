import { useQuery, useQueryClient } from '@tanstack/react-query'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { stylesForCell, createUndoStack, moveSelection, type FormatRule } from '@datavalley/shared'
import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Column, RowRecord } from '@datavalley/api-client'
import { api } from '../../lib/api'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { EmptyState, ErrorState, LoadingBlock } from '../../components/states'

const undo = createUndoStack<{ rowId: string; columnId: string; version: number; value: unknown; next: unknown }>()

type ViewDefinition = {
  filter?: { op: string; columnId: string; value?: string } | null
  sort?: string | null
  formatting?: FormatRule[]
}

type SavedView = { id: string; name: string; shared: boolean; definition: ViewDefinition }

function showCell(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'object' && value && 'error' in value) return String((value as { error: string }).error)
  return String(value)
}

function writable(column: Column) {
  return column.type !== 'formula' && column.type !== 'lookup'
}

export function TableGrid({ tableId, columns }: { tableId: string; columns: Column[] }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const parentRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('')
  const [filterColumn, setFilterColumn] = useState('')
  const [filterOp, setFilterOp] = useState('eq')
  const [filterValue, setFilterValue] = useState('')
  const [formatColumn, setFormatColumn] = useState('')
  const [formatOp, setFormatOp] = useState('eq')
  const [formatValue, setFormatValue] = useState('')
  const [formatColor, setFormatColor] = useState('#0f766e')
  const [viewName, setViewName] = useState('')
  const [sharedView, setSharedView] = useState(false)
  const [activeView, setActiveView] = useState('')
  const [importNote, setImportNote] = useState('')
  const [fillColumn, setFillColumn] = useState('')
  const [selected, setSelected] = useState({ row: 0, column: 0 })
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [checked, setChecked] = useState<string[]>([])
  const visible = columns.filter((column) => !column.hidden)
  const editable = visible.filter(writable)
  const filter = filterColumn ? { op: filterOp, columnId: filterColumn, value: filterValue } : null
  const formatting: FormatRule[] = formatColumn
    ? [{ id: 'active', scope: 'cell', columnId: formatColumn, operator: formatOp, value: formatValue, style: { color: formatColor } }]
    : []

  const views = useQuery({
    queryKey: ['views', tableId],
    queryFn: () => api.request<{ views: SavedView[] }>(`/tables/${tableId}/views`),
  })
  const rowsQuery = useQuery({
    queryKey: ['rows', tableId, search, sort, filter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '50' })
      if (search) params.set('q', search)
      if (sort) params.set('sort', sort)
      if (filter) params.set('filter', JSON.stringify(filter))
      return api.request<{ rows: RowRecord[]; nextCursor: string | null }>(`/tables/${tableId}/rows?${params}`)
    },
  })
  const editingColumn = visible.find((column) => editing?.endsWith(`:${column.id}`))
  const targetTableId = editingColumn?.type === 'relation' ? String(editingColumn.config.toTableId ?? '') : ''
  const targetRows = useQuery({
    queryKey: ['rows', targetTableId, 'link'],
    enabled: Boolean(targetTableId),
    queryFn: () => api.request<{ rows: RowRecord[] }>(`/tables/${targetTableId}/rows?limit=50`),
  })

  const rows = rowsQuery.data?.rows ?? []
  const tableColumns = useMemo<ColumnDef<RowRecord>[]>(
    () => [
      {
        id: 'select',
        header: '',
        size: 40,
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={row.original.id}
            checked={checked.includes(row.original.id)}
            onChange={(event) =>
              setChecked((current) =>
                event.target.checked ? [...current, row.original.id] : current.filter((id) => id !== row.original.id),
              )
            }
          />
        ),
      },
      ...visible.map((column) => ({
        id: column.id,
        header: column.name,
        size: column.width,
        cell: ({ row }: { row: { original: RowRecord; index: number } }) => {
          const value = row.original.cells[column.id]
          const style = stylesForCell(formatting, row.original.cells, column.id)
          const active = editing === `${row.original.id}:${column.id}`
          const text = showCell(value)
          return (
            <div className="h-9 px-2" style={{ color: style.color, background: style.background, fontWeight: style.bold ? 700 : 400 }}>
              {active && column.type === 'relation' ? (
                <select
                  autoFocus
                  className="h-7 w-full bg-transparent text-sm outline-none"
                  value={draft}
                  aria-label={`Edit ${column.name}`}
                  onChange={(event) => {
                    setDraft(event.target.value)
                    void commit(row.original, column.id, event.target.value)
                  }}
                >
                  <option value="">{t('none')}</option>
                  {(targetRows.data?.rows ?? []).map((target) => (
                    <option key={target.id} value={target.id}>
                      {showCell(Object.values(target.cells).find((item) => typeof item === 'string' && item) ?? target.id.slice(0, 8))}
                    </option>
                  ))}
                </select>
              ) : active ? (
                <input
                  autoFocus
                  className="h-7 w-full bg-transparent outline-none"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => void commit(row.original, column.id, draft)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void commit(row.original, column.id, draft)
                    if (event.key === 'Escape') setEditing(null)
                  }}
                />
              ) : writable(column) ? (
                <button
                  className="h-full w-full truncate text-left"
                  aria-label={`Edit ${column.name}`}
                  onClick={() => {
                    setSelected({ row: row.index, column: visible.findIndex((item) => item.id === column.id) })
                    setEditing(`${row.original.id}:${column.id}`)
                    setDraft(text)
                  }}
                >
                  {text}
                </button>
              ) : (
                <span className="block h-full truncate leading-9">{text}</span>
              )}
            </div>
          )
        },
      })),
    ],
    [checked, draft, editing, formatting, t, targetRows.data?.rows, visible],
  )
  const table = useReactTable({ data: rows, columns: tableColumns, getCoreRowModel: getCoreRowModel() })
  const virtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 8,
  })

  async function commit(row: RowRecord, columnId: string, nextValue: string) {
    const previous = row.cells[columnId] ?? null
    const next = nextValue === '' ? null : nextValue
    setEditing(null)
    undo.push({ undo: { rowId: row.id, columnId, version: row.version, value: next, next: previous }, redo: { rowId: row.id, columnId, version: row.version, value: previous, next } })
    try {
      await api.request(`/rows/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ version: row.version, cells: { [columnId]: next } }),
      })
    } catch {
      await queryClient.invalidateQueries({ queryKey: ['rows', tableId] })
    }
    await queryClient.invalidateQueries({ queryKey: ['rows', tableId] })
  }

  async function pasteTsv(text: string) {
    const grid = text.replace(/\r/g, '').split('\n').filter((line) => line.length > 0).map((line) => line.split('\t'))
    const targets = visible.slice(selected.column).filter(writable)
    const updates: { rowId: string; version: number; cells: Record<string, unknown> }[] = []
    for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
      const row = rows[selected.row + rowIndex]
      if (!row) break
      const cells: Record<string, unknown> = {}
      grid[rowIndex].forEach((value, columnIndex) => {
        const column = targets[columnIndex]
        if (!column) return
        cells[column.id] = value
      })
      if (Object.keys(cells).length > 0) updates.push({ rowId: row.id, version: row.version, cells })
    }
    if (updates.length === 0) return
    await api.request(`/tables/${tableId}/cells/bulk`, { method: 'PATCH', body: JSON.stringify({ updates }) })
    await queryClient.invalidateQueries({ queryKey: ['rows', tableId] })
  }

  function applyView(viewId: string) {
    setActiveView(viewId)
    const view = views.data?.views.find((item) => item.id === viewId)
    if (!view) return
    const definition = view.definition ?? {}
    setSort(definition.sort ?? '')
    setFilterColumn(definition.filter?.columnId ?? '')
    setFilterOp(definition.filter?.op ?? 'eq')
    setFilterValue(definition.filter?.value == null ? '' : String(definition.filter.value))
    const rule = definition.formatting?.[0]
    setFormatColumn(rule?.columnId ?? '')
    setFormatOp(rule?.operator ?? 'eq')
    setFormatValue(rule?.value == null ? '' : String(rule.value))
    setFormatColor(rule?.style.color ?? '#0f766e')
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        const command = event.shiftKey ? undo.popRedo() : undo.popUndo()
        if (!command) return
        const change = event.shiftKey ? command.redo : command.undo
        void api.request(`/rows/${change.rowId}`, {
          method: 'PATCH',
          body: JSON.stringify({ version: change.version, cells: { [change.columnId]: change.next } }),
        })
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key) && parentRef.current?.contains(document.activeElement)) {
        setSelected((current) => moveSelection(current, event.key, { rows: Math.max(rows.length, 1), columns: Math.max(visible.length, 1) }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rows.length, visible.length])

  if (rowsQuery.isLoading) return <LoadingBlock />
  if (rowsQuery.isError) return <ErrorState message={(rowsQuery.error as Error).message} />

  const orderedChecked = rows.map((row) => row.id).filter((id) => checked.includes(id))
  const fillTarget = fillColumn || editable[0]?.id || ''

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex min-h-9 flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder={t('search')} value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="h-9 rounded-md border border-border bg-card px-2 text-sm" value={sort} onChange={(event) => setSort(event.target.value)} aria-label={t('sort')}>
          <option value="">{t('sort')}</option>
          {visible.map((column) => (
            <option key={column.id} value={column.id}>{column.name}</option>
          ))}
        </select>
        <select className="h-9 rounded-md border border-border bg-card px-2 text-sm" value={activeView} onChange={(event) => applyView(event.target.value)} aria-label={t('views')}>
          <option value="">{t('views')}</option>
          {(views.data?.views ?? []).map((view) => (
            <option key={view.id} value={view.id}>{view.name}</option>
          ))}
        </select>
        <Button
          variant="outline"
          onClick={async () => {
            await api.request(`/tables/${tableId}/rows`, { method: 'POST', body: JSON.stringify({ cells: {} }) })
            await queryClient.invalidateQueries({ queryKey: ['rows', tableId] })
          }}
        >
          {t('addRow')}
        </Button>
        <Button
          variant="outline"
          disabled={checked.length === 0}
          onClick={async () => {
            await api.request(`/tables/${tableId}/rows/bulk-delete`, { method: 'POST', body: JSON.stringify({ rowIds: checked }) })
            setChecked([])
            await queryClient.invalidateQueries({ queryKey: ['rows', tableId] })
          }}
        >
          {t('bulkDelete')}
        </Button>
        <select className="h-9 rounded-md border border-border bg-card px-2 text-sm" value={fillTarget} onChange={(event) => setFillColumn(event.target.value)} aria-label={t('fillDown')}>
          {editable.map((column) => (
            <option key={column.id} value={column.id}>{column.name}</option>
          ))}
        </select>
        <Button
          variant="outline"
          disabled={orderedChecked.length < 2 || !fillTarget}
          onClick={async () => {
            await api.request(`/tables/${tableId}/fill`, {
              method: 'POST',
              body: JSON.stringify({ columnId: fillTarget, rowIds: orderedChecked }),
            })
            setChecked([])
            await queryClient.invalidateQueries({ queryKey: ['rows', tableId] })
          }}
        >
          {t('fillDown')}
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            const result = await api.request<{ csv: string }>(`/tables/${tableId}/export`, {
              method: 'POST',
              body: JSON.stringify({ filter }),
            })
            const url = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv' }))
            const link = document.createElement('a')
            link.href = url
            link.download = 'export.csv'
            document.body.appendChild(link)
            link.click()
            link.remove()
            URL.revokeObjectURL(url)
          }}
        >
          {t('export')}
        </Button>
        <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-border bg-card px-3 text-sm">
          {t('import')}
          <input
            aria-label={t('import')}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              const body = new FormData()
              body.append('file', file)
              const result = await api.request<{ created: number; errors: { error?: string }[] }>(`/tables/${tableId}/import`, { method: 'POST', body })
              setImportNote(result.errors.length > 0 ? `${t('imported', { count: result.created })} ${result.errors[0]?.error ?? ''}` : t('imported', { count: result.created }))
              await queryClient.invalidateQueries({ queryKey: ['rows', tableId] })
            }}
          />
        </label>
      </div>
      <div className="flex min-h-9 flex-wrap items-center gap-2">
        <select className="h-9 rounded-md border border-border bg-card px-2 text-sm" value={filterColumn} onChange={(event) => setFilterColumn(event.target.value)} aria-label={t('filter')}>
          <option value="">{t('filter')}</option>
          {visible.map((column) => (
            <option key={column.id} value={column.id}>{column.name}</option>
          ))}
        </select>
        <select className="h-9 rounded-md border border-border bg-card px-2 text-sm" value={filterOp} onChange={(event) => setFilterOp(event.target.value)} aria-label={t('operator')}>
          <option value="eq">eq</option>
          <option value="contains">contains</option>
          <option value="gt">gt</option>
        </select>
        <Input className="w-32" placeholder={t('value')} value={filterValue} onChange={(event) => setFilterValue(event.target.value)} />
        <select className="h-9 rounded-md border border-border bg-card px-2 text-sm" value={formatColumn} onChange={(event) => setFormatColumn(event.target.value)} aria-label={t('formatting')}>
          <option value="">{t('formatting')}</option>
          {visible.map((column) => (
            <option key={column.id} value={column.id}>{column.name}</option>
          ))}
        </select>
        <Input className="w-28" placeholder={t('value')} aria-label={t('formatValue')} value={formatValue} onChange={(event) => setFormatValue(event.target.value)} />
        <input className="h-9 w-9 rounded-md border border-border bg-card" type="color" aria-label={t('color')} value={formatColor} onChange={(event) => setFormatColor(event.target.value)} />
        <Input className="w-36" placeholder={t('viewName')} value={viewName} onChange={(event) => setViewName(event.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sharedView} onChange={(event) => setSharedView(event.target.checked)} />
          {t('shared')}
        </label>
        <Button
          variant="outline"
          disabled={viewName.trim() === ''}
          onClick={async () => {
            try {
              await api.request(`/tables/${tableId}/views`, {
                method: 'POST',
                body: JSON.stringify({
                  name: viewName.trim(),
                  shared: sharedView,
                  definition: { filter, sort: sort || null, formatting },
                }),
              })
              setViewName('')
              setImportNote('')
              await queryClient.invalidateQueries({ queryKey: ['views', tableId] })
            } catch (caught) {
              setImportNote(caught instanceof Error ? caught.message : t('error'))
            }
          }}
        >
          {t('saveView')}
        </Button>
      </div>
      <p className="min-h-5 text-sm text-muted-foreground">{importNote}</p>
      {rows.length === 0 ? (
        <EmptyState title={t('emptyRows')} body={t('emptyRowsBody')} />
      ) : (
        <div
          ref={parentRef}
          tabIndex={0}
          className="h-[calc(100vh-16rem)] min-h-80 overflow-auto rounded-md border border-border bg-card"
          onPaste={(event: ClipboardEvent<HTMLDivElement>) => {
            if (editing) return
            const text = event.clipboardData.getData('text/plain')
            if (!text.includes('\t') && !text.includes('\n')) return
            event.preventDefault()
            void pasteTsv(text)
          }}
        >
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-muted">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th key={header.id} className="h-10 border-b border-border px-2 text-left font-medium" style={{ width: header.getSize() }}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = table.getRowModel().rows[virtualRow.index]
                return (
                  <tr key={row.id} className={selected.row === virtualRow.index ? 'bg-accent/60' : undefined} style={{ height: 36 }}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="border-b border-border p-0">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
