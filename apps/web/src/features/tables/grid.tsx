import { useQuery, useQueryClient } from '@tanstack/react-query'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { stylesForCell, createUndoStack, moveSelection } from '@datavalley/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Column, RowRecord } from '@datavalley/api-client'
import { api } from '../../lib/api'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { EmptyState, ErrorState, LoadingBlock } from '../../components/states'

const undo = createUndoStack<{ rowId: string; columnId: string; version: number; value: unknown; next: unknown }>()

export function TableGrid({ tableId, columns }: { tableId: string; columns: Column[] }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const parentRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<string>('')
  const [selected, setSelected] = useState({ row: 0, column: 0 })
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [checked, setChecked] = useState<string[]>([])
  const visible = columns.filter((column) => !column.hidden)
  const rowsQuery = useQuery({
    queryKey: ['rows', tableId, search, sort],
    queryFn: () => {
      const params = new URLSearchParams({ limit: '50' })
      if (search) params.set('q', search)
      if (sort) params.set('sort', sort)
      return api.request<{ rows: RowRecord[]; nextCursor: string | null }>(`/tables/${tableId}/rows?${params}`)
    },
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
          const style = stylesForCell([], row.original.cells, column.id)
          const active = editing === `${row.original.id}:${column.id}`
          return (
            <div className="h-9 px-2" style={{ color: style.color, background: style.background, fontWeight: style.bold ? 700 : 400 }}>
              {active ? (
                <input
                  autoFocus
                  className="h-7 w-full bg-transparent outline-none"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => void commit(row.original, column.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void commit(row.original, column.id)
                    if (event.key === 'Escape') setEditing(null)
                  }}
                />
              ) : (
                <button
                  className="h-full w-full truncate text-left"
                  aria-label={`Edit ${column.name}`}
                  onClick={() => {
                    setSelected({ row: row.index, column: visible.findIndex((item) => item.id === column.id) })
                    setEditing(`${row.original.id}:${column.id}`)
                    setDraft(value == null ? '' : String(value))
                  }}
                >
                  {value == null ? '' : String(value)}
                </button>
              )}
            </div>
          )
        },
      })),
    ],
    [checked, draft, editing, visible],
  )
  const table = useReactTable({ data: rows, columns: tableColumns, getCoreRowModel: getCoreRowModel() })
  const virtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 8,
  })

  async function commit(row: RowRecord, columnId: string) {
    const previous = row.cells[columnId] ?? null
    const next = draft === '' ? null : draft
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex min-h-9 items-center gap-2">
        <Input className="max-w-xs" placeholder={t('search')} value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="h-9 rounded-md border border-border bg-card px-2 text-sm" value={sort} onChange={(event) => setSort(event.target.value)} aria-label={t('sort')}>
          <option value="">{t('sort')}</option>
          {visible.map((column) => (
            <option key={column.id} value={column.id}>
              {column.name}
            </option>
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
      </div>
      {rows.length === 0 ? (
        <EmptyState title={t('emptyRows')} body={t('emptyRowsBody')} />
      ) : (
        <div ref={parentRef} tabIndex={0} className="h-[calc(100vh-16rem)] min-h-80 overflow-auto rounded-md border border-border bg-card">
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
