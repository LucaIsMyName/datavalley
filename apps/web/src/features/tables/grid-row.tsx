import { memo, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { CatalogItem, Column, MediaFile, RowRecord } from '@datavalley/api-client'
import { matchesCondition } from '@datavalley/formula-engine'
import {
  conditionalStyle,
  isDateColumnType,
  paintSwatch,
  type FormatRule,
} from '@datavalley/shared'
import { ArrowUpRight, GripVertical, Plus } from 'lucide-react'
import { Checkbox } from '../../components/ui/checkbox'
import { fillableColumn as fillable } from './cell-display'
import { presentFormatRow } from './format-values'
import { columnHasFormatRules } from './grid-edit'
import { rowTint } from './grid-ux'
import { beforeDropEdge } from './drop-place'
import { TableCellInput } from './table-cell-input'
import type { PresencePerson } from '@datavalley/shared'
import { PresenceChip, remoteRing } from '../realtime/presence-chip'
import { cellPeers } from '../realtime/presence'

const TABLE_GRID_DIVIDER = 'border-b border-r border-border'

export const EMPTY_ROWS: RowRecord[] = []

export type GridRowHandlers = {
  t: (key: string, options?: Record<string, unknown>) => string
  openRowMenu: (event: ReactMouseEvent, row: RowRecord) => void
  insertRow: (beforeId?: string) => void
  setChecked: (update: string[] | ((current: string[]) => string[])) => void
  setDrawerRowId: (id: string) => void
  focusCell: (rowIndex: number, columnIndex: number) => void
  activateCell: (row: RowRecord, column: Column) => void
  scheduleCell: (row: RowRecord, column: Column, value: unknown, delay?: number) => void
  clearInvalid: (rowId: string, columnId: string) => void
  releaseEdit: (editingKey: string, focusGrid?: boolean) => void
  setMediaLibrary: (value: { rowId: string; columnId: string; existingIds: string[] } | null) => void
  openMediaPreview: (file: MediaFile, rowId: string, columnId: string) => void
  requestMediaUpload: (rowId: string, columnId: string) => void
  applyMediaCell: (row: RowRecord, column: Column, value: { fileIds: string[] } | null) => Promise<void>
  applyDateMode: (column: Column, patch: { range?: boolean; includeTime?: boolean }) => void
  beginFill: (event: ReactPointerEvent, rowIndex: number, column: Column) => void
  openCellMenu: (event: ReactMouseEvent, row: RowRecord, column: Column) => void
  onCreated: (kind: 'tag' | 'status', item: CatalogItem) => void
  onOptionChange: (
    columnId: string,
    option: { id: string; label: string; color: string | null; position: string },
    deleted?: boolean,
  ) => void
  cellWritable: (column: Column) => boolean
  dataReadOnly: boolean
  invalidFor: (rowId: string, columnId: string) => { text: string; message: string } | undefined
  reorderRow: (rowId: string, beforeId: string) => void
  setSort: () => void
  dragItem: { current: { kind: 'column' | 'row'; id: string } | null }
  setDropTarget: (
    value:
      | { kind: 'column' | 'row'; id: string }
      | null
      | ((
          current: { kind: 'column' | 'row'; id: string } | null,
        ) => { kind: 'column' | 'row'; id: string } | null),
  ) => void
  rowsRef: { current: RowRecord[] }
  pressOrigin: { current: { x: number; y: number } }
  pressTimer: { current: number }
}

type GridBodyRowProps = {
  row: RowRecord
  rowIndex: number
  columns: Column[]
  visible: Column[]
  rules: FormatRule[]
  tags: CatalogItem[]
  statuses: CatalogItem[]
  members: { userId: string; username: string }[]
  selectedColumn: number
  editingColumnId: string | null
  checked: boolean
  fillColumnId: string | null
  spotlightColumnId: string | null
  spotlightRow: boolean
  aiRow: boolean
  aiColumnKey: string
  invalidSignature: string
  dropColumnId: string | null
  dropRow: boolean
  mediaUploadingColumnId: string | null
  readOnly: boolean
  relationRows: RowRecord[]
  tableId: string
  handlers: { current: GridRowHandlers | null }
  remoteKey: string
  peers: PresencePerson[]
}

function GridBodyRowView({
  row,
  rowIndex,
  columns,
  visible,
  rules,
  tags,
  statuses,
  members,
  selectedColumn,
  editingColumnId,
  checked,
  fillColumnId,
  spotlightColumnId,
  spotlightRow,
  aiRow,
  aiColumnKey,
  dropColumnId,
  dropRow,
  mediaUploadingColumnId,
  readOnly,
  relationRows,
  tableId,
  handlers,
  peers,
}: GridBodyRowProps) {
  const api = handlers.current
  if (!api) return null
  const presented = presentFormatRow(columns, row.cells, {
    tags: tags.map((tag) => ({ id: tag.id, name: tag.name })),
    statuses: statuses.map((status) => ({ id: status.id, name: status.name })),
    members: members.map((member) => ({ id: member.userId, name: member.username })),
  })
  const visibleIndex = new Map(visible.map((column, index) => [column.id, index]))
  const rowColor = row.color

  return (
    <tr
      className={`group ${spotlightRow && !spotlightColumnId ? 'bg-accent' : ''} ${aiRow && !(spotlightRow && !spotlightColumnId) ? 'bg-accent' : ''}`}
      onDragOver={(event) => {
        const from = api.dragItem.current
        if (!from || from.kind !== 'row') return
        event.preventDefault()
        const next = beforeDropEdge(
          (api.rowsRef.current ?? []).map((item) => item.id),
          from.id,
          row.id,
        )
          ? row.id
          : null
        api.setDropTarget((current) => {
          if (next === null) return current?.kind === 'row' ? null : current
          if (current?.kind === 'row' && current.id === next) return current
          return { kind: 'row', id: next }
        })
      }}
      onDrop={(event) => {
        event.preventDefault()
        const payload = event.dataTransfer.getData('text/plain')
        api.dragItem.current = null
        api.setDropTarget(null)
        if (!payload.startsWith('row:')) return
        api.setSort()
        api.reorderRow(payload.slice(4), row.id)
      }}
    >
      <td className={`relative sticky left-0 z-10 overflow-hidden ${TABLE_GRID_DIVIDER} p-0 ${spotlightRow && !spotlightColumnId ? 'bg-accent' : aiRow ? 'bg-accent' : 'bg-card'}`}>
        {dropRow ? (
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 bg-primary" />
        ) : null}
        <div
          className="flex h-9 items-center gap-1 px-1"
          onContextMenu={(event) => api.openRowMenu(event, row)}
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse') return
            const point = { x: event.clientX, y: event.clientY }
            api.pressOrigin.current = point
            window.clearTimeout(api.pressTimer.current)
            api.pressTimer.current = window.setTimeout(() => {
              api.openRowMenu(
                { preventDefault() {}, clientX: point.x, clientY: point.y } as ReactMouseEvent,
                row,
              )
            }, 500)
          }}
          onPointerMove={(event) => {
            if (Math.hypot(event.clientX - api.pressOrigin.current.x, event.clientY - api.pressOrigin.current.y) > 10) {
              window.clearTimeout(api.pressTimer.current)
            }
          }}
          onPointerUp={() => window.clearTimeout(api.pressTimer.current)}
          onPointerCancel={() => window.clearTimeout(api.pressTimer.current)}
        >
          <button
            type="button"
            aria-label={api.t('insertRow')}
            className="inline-flex size-6 items-center justify-center text-muted-foreground"
            onClick={(event) => {
              event.stopPropagation()
              const next = api.rowsRef.current?.[rowIndex + 1]?.id
              api.insertRow(next)
            }}
          >
            <Plus className="size-3.5" />
          </button>
          <span
            role="button"
            tabIndex={-1}
            draggable
            aria-label={api.t('reorder')}
            className="inline-flex shrink-0 cursor-grab text-muted-foreground"
            onMouseDown={(event) => event.stopPropagation()}
            onDragStart={(event) => {
              event.stopPropagation()
              api.dragItem.current = { kind: 'row', id: row.id }
              event.dataTransfer.setData('text/plain', `row:${row.id}`)
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={() => {
              api.dragItem.current = null
              api.setDropTarget(null)
            }}
          >
            <GripVertical className="size-3.5" />
          </span>
          <Checkbox
            aria-label={api.t('selectRowNumber', { number: row.rowNumber })}
            checked={checked}
            onCheckedChange={(next) => {
              api.setChecked((current) =>
                next === true ? [...current, row.id] : current.filter((id) => id !== row.id),
              )
            }}
          />
          <button
            type="button"
            aria-label={api.t('notes')}
            className={`inline-flex shrink-0 ${row.notes?.trim() ? 'text-foreground' : 'text-muted-foreground'}`}
            onClick={(event) => {
              event.stopPropagation()
              api.setDrawerRowId(row.id)
            }}
          >
            <ArrowUpRight className="size-3.5" />
          </button>
        </div>
      </td>
      {columns.map((column) => {
        if (column.hidden) {
          return <td key={column.id} className={`relative h-9 overflow-hidden ${TABLE_GRID_DIVIDER} p-0`} />
        }
        const columnIndex = visibleIndex.get(column.id) ?? -1
        const active = editingColumnId === column.id
        const picked = selectedColumn === columnIndex
        const hasRules = columnHasFormatRules(rules, row.formats?.[column.id], column.id)
        const ruleStyle = hasRules
          ? conditionalStyle(rules, row.formats?.[column.id], row.cells, column.id, (expression) =>
              matchesCondition(expression, presented[column.id] ?? null, presented),
            )
          : {}
        const cellPaint = row.backgrounds?.[column.id] || ruleStyle.background
        const painted = paintSwatch(cellPaint, 'background') ?? rowTint(rowColor, paintSwatch(rowColor, 'background'))
        const stripe = !cellPaint && rowColor ? paintSwatch(rowColor, 'background') : undefined
        const mono =
          column.type === 'number' ||
          column.type === 'currency' ||
          column.type === 'formula' ||
          column.type === 'lookup'
        const lit = spotlightColumnId === column.id
        const aiMarked = aiColumnKey.split(',').includes(column.id)
        const inFill = fillColumnId === column.id
        const dateEditing = active && isDateColumnType(column.type)
        const remotes = cellPeers(peers, tableId, row.id, column.id)
        const remoteDraft = !active ? remotes.find((person) => person.editing && person.draft != null)?.draft : undefined
        const presenceRing = remoteRing(remotes, picked || lit)
        return (
          <td
            key={column.id}
            className={`relative ${dateEditing ? 'overflow-visible' : 'overflow-hidden'} ${TABLE_GRID_DIVIDER} p-0`}
          >
            {dropColumnId === column.id ? (
              <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-20 w-0.5 bg-primary" />
            ) : null}
            {dropRow ? (
              <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 bg-primary" />
            ) : null}
            <div
              className={`relative flex h-9 min-w-0 items-center px-2 ${column.type === 'media' ? 'overflow-x-auto overflow-y-hidden' : dateEditing ? 'overflow-visible' : 'overflow-hidden'} ${mono ? 'font-mono' : ''} ${picked || lit ? 'ring-2 ring-inset ring-primary' : ''} ${aiMarked && !(picked || lit) ? 'ring-2 ring-inset ring-primary' : ''} ${inFill && !picked ? 'bg-accent' : ''}`}
              style={{
                color: paintSwatch(ruleStyle.color, 'text'),
                background: inFill && !picked ? undefined : painted,
                boxShadow: [stripe ? `inset 3px 0 0 ${stripe}` : null, presenceRing].filter(Boolean).join(', ') || undefined,
                fontWeight: ruleStyle.bold ? 700 : 400,
              }}
              onContextMenu={(event) => api.openCellMenu(event, row, column)}
              onClick={(event) => {
                const target = event.target
                if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) return
                api.focusCell(rowIndex, columnIndex)
                if (event.detail >= 2) api.activateCell(row, column)
              }}
            >
              <PresenceChip people={remotes} also={active} className="absolute top-0 left-1 z-20" />
              <TableCellInput
                column={column}
                row={row}
                active={active}
                tableId={tableId}
                tags={tags}
                statuses={statuses}
                members={members}
                relationRows={relationRows}
                readOnly={readOnly}
                remoteDraft={remoteDraft ?? undefined}
                invalid={api.invalidFor(row.id, column.id)}
                onScheduleCell={api.scheduleCell}
                onClearInvalid={api.clearInvalid}
                onDeactivate={api.releaseEdit}
                onOpen={() => api.focusCell(rowIndex, columnIndex)}
                onActivate={() => api.activateCell(row, column)}
                onCreated={api.onCreated}
                onOptionChange={api.onOptionChange}
                onMediaLibrary={(existingIds) => api.setMediaLibrary({ rowId: row.id, columnId: column.id, existingIds })}
                onMediaPreview={(file) => api.openMediaPreview(file, row.id, column.id)}
                onMediaRequestUpload={() => api.requestMediaUpload(row.id, column.id)}
                onMediaUploading={mediaUploadingColumnId === column.id}
                onMediaCommit={(value) => api.applyMediaCell(row, column, value)}
                onDateMode={(patch) => api.applyDateMode(column, patch)}
              />
              {picked && !active && fillable(column) ? (
                <button
                  type="button"
                  aria-label={api.t('fillHandle')}
                  className="absolute bottom-0 right-0 z-10 flex size-2 cursor-crosshair items-center justify-center border border-primary bg-primary text-primary"
                  onPointerDown={(event) => api.beginFill(event, rowIndex, column)}
                  onClick={(event) => event.stopPropagation()}
                >
                  
                </button>
              ) : null}
            </div>
          </td>
        )
      })}
      <td className="border-b border-border" />
    </tr>
  )
}

function sameRow(prev: GridBodyRowProps, next: GridBodyRowProps) {
  return (
    prev.row === next.row &&
    prev.rowIndex === next.rowIndex &&
    prev.columns === next.columns &&
    prev.visible === next.visible &&
    prev.rules === next.rules &&
    prev.tags === next.tags &&
    prev.statuses === next.statuses &&
    prev.members === next.members &&
    prev.selectedColumn === next.selectedColumn &&
    prev.editingColumnId === next.editingColumnId &&
    prev.checked === next.checked &&
    prev.fillColumnId === next.fillColumnId &&
    prev.spotlightColumnId === next.spotlightColumnId &&
    prev.spotlightRow === next.spotlightRow &&
    prev.aiRow === next.aiRow &&
    prev.aiColumnKey === next.aiColumnKey &&
    prev.invalidSignature === next.invalidSignature &&
    prev.dropColumnId === next.dropColumnId &&
    prev.dropRow === next.dropRow &&
    prev.mediaUploadingColumnId === next.mediaUploadingColumnId &&
    prev.readOnly === next.readOnly &&
    prev.relationRows === next.relationRows &&
    prev.tableId === next.tableId &&
    prev.handlers === next.handlers &&
    prev.remoteKey === next.remoteKey
  )
}

export const GridBodyRow = memo(GridBodyRowView, sameRow)
