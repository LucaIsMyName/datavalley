import type { CatalogItem, Column, RowRecord } from '@datavalley/api-client'
import type { KanbanDisplay } from '@datavalley/shared'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Label } from '../../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../components/ui/select'
import { displayCellValue } from './cell-display'
import { kanbanLanes } from './kanban-board'

function statusValue(column: Column, value: unknown) {
  if (typeof value === 'string' && value.length > 0) return value
  return null
}

function fieldText(
  column: Column,
  value: unknown,
  language: string,
  members: { userId: string; username: string }[],
) {
  if (value == null || value === '') return ''
  if (column.type === 'user' && Array.isArray(value)) {
    return value
      .map((id) => members.find((member) => member.userId === String(id))?.username ?? '')
      .filter(Boolean)
      .join(', ')
  }
  if (column.type === 'select' || column.type === 'status') {
    const id = String(value)
    const option =
      column.type === 'status'
        ? undefined
        : column.options.find((item) => item.id === id)
    return option?.label ?? id
  }
  if (column.type === 'relation' || column.type === 'media') return ''
  const text = displayCellValue(column, value, language)
  return text == null ? '' : String(text)
}

export function KanbanView({
  projectId,
  tableId,
  columns,
  rows,
  statuses,
  members,
  kanban,
  counts,
  readOnly,
  onChange,
  onMove,
}: {
  projectId: string
  tableId: string
  columns: Column[]
  rows: RowRecord[]
  statuses: CatalogItem[]
  members: { userId: string; username: string }[]
  kanban: KanbanDisplay
  counts?: Record<string, number>
  readOnly: boolean
  onChange: (kanban: KanbanDisplay) => void
  onMove: (row: RowRecord, statusId: string | null) => void
}) {
  const { t, i18n } = useTranslation()
  const [dragging, setDragging] = useState<string | null>(null)
  const statusColumns = columns.filter((column) => column.type === 'select' || column.type === 'status')
  const statusColumn = statusColumns.find((column) => column.id === kanban.statusColumnId) ?? null
  const options = useMemo(() => {
    if (!statusColumn) return []
    if (statusColumn.type === 'status') {
      return [...statuses]
        .sort((left, right) => ((left.position ?? '') < (right.position ?? '') ? -1 : 1))
        .map((status) => ({ id: status.id, label: status.name }))
    }
    return [...statusColumn.options]
      .sort((left, right) => (left.position < right.position ? -1 : 1))
      .map((option) => ({ id: option.id, label: option.label }))
  }, [statusColumn, statuses])
  const lanes = useMemo(() => {
    if (!statusColumn) return []
    return kanbanLanes(
      rows.map((row) => ({ id: row.id, status: statusValue(statusColumn, row.cells[statusColumn.id]) })),
      options,
      kanban.statusOrder,
    )
  }, [kanban.statusOrder, options, rows, statusColumn])
  const titleColumn =
    columns.find((column) => kanban.cardColumnIds.includes(column.id) && column.type === 'text') ??
    columns.find((column) => column.type === 'text' || column.type === 'mail')
  const detailColumns = columns.filter(
    (column) =>
      column.id !== statusColumn?.id &&
      column.id !== titleColumn?.id &&
      (kanban.cardColumnIds.length === 0
        ? column.type === 'mail' || column.type === 'number' || column.type === 'date' || column.type === 'user'
        : kanban.cardColumnIds.includes(column.id)),
  )

  function dropOn(statusId: string) {
    const row = rows.find((item) => item.id === dragging)
    setDragging(null)
    if (!row || readOnly) return
    const current = statusColumn ? statusValue(statusColumn, row.cells[statusColumn.id]) : null
    const next = statusId || null
    if (current === next) return
    onMove(row, next)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="kanban-status">{t('kanbanStatus')}</Label>
        <Select
          value={statusColumn?.id ?? ''}
          onValueChange={(value) =>
            onChange({ ...kanban, statusColumnId: value || null, cardColumnIds: kanban.cardColumnIds.filter((id) => id !== value) })
          }
        >
          <SelectTrigger id="kanban-status" className="h-9 w-48">
            <span className="truncate">{statusColumn?.name ?? t('kanbanPickStatus')}</span>
          </SelectTrigger>
          <SelectContent>
            {statusColumns.map((column) => (
              <SelectItem key={column.id} value={column.id}>
                {column.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {statusColumn ? (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
          {lanes.map((lane) => (
            <section
              key={lane.id || 'unset'}
              className="flex w-64 shrink-0 flex-col gap-2 border border-border bg-card p-2"
              onDragOver={(event) => {
                if (!readOnly) event.preventDefault()
              }}
              onDrop={(event) => {
                event.preventDefault()
                dropOn(lane.id)
              }}
            >
              <h2 className="px-1 text-sm font-medium">
                {lane.id ? lane.label : t('kanbanUnset')}
                <span className="ml-2 text-muted-foreground">{counts?.[lane.id] ?? lane.rowIds.length}</span>
              </h2>
              <div className="flex min-h-24 flex-col gap-2">
                {lane.rowIds.map((rowId) => {
                  const row = rows.find((item) => item.id === rowId)
                  if (!row) return null
                  const title = titleColumn
                    ? fieldText(titleColumn, row.cells[titleColumn.id], i18n.language, members)
                    : ''
                  return (
                    <article
                      key={row.id}
                      draggable={!readOnly}
                      onDragStart={() => setDragging(row.id)}
                      onDragEnd={() => setDragging(null)}
                      className="cursor-grab border border-border bg-background p-2 text-sm active:cursor-grabbing"
                    >
                      <Link
                        to={`/projects/${projectId}/tables/${tableId}/rows/${row.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {title || `#${row.rowNumber}`}
                      </Link>
                      {detailColumns.slice(0, 3).map((column) => {
                        const text = fieldText(column, row.cells[column.id], i18n.language, members)
                        if (!text) return null
                        return (
                          <p key={column.id} className="truncate text-muted-foreground">
                            {text}
                          </p>
                        )
                      })}
                    </article>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('kanbanNeedsStatus')}</p>
      )}
    </div>
  )
}
