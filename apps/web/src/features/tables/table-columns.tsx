import { type ColumnDef } from '@tanstack/react-table'
import { type RowRecord } from '@datavalley/api-client'
import { matchesCondition } from '@datavalley/formula-engine'
import {
  conditionalStyle,
  paintSwatch,
  isDateColumnType,
  isSelectFamilyType,
} from '@datavalley/shared'
import { ArrowUpRight, GripVertical, Plus } from 'lucide-react'
import { type MouseEvent as ReactMouseEvent } from 'react'
import { Checkbox } from '../../components/ui/checkbox'
import { fillableColumn as fillable } from './cell-display'
import { patchCachedTable } from './cache'
import { rowTint } from './grid-ux'
import { presentFormatRow } from './format-values'
import { mergeColumnOption } from './select-options-utils'
import { TableCellInput } from './table-cell-input'

export const GUTTER_WIDTH = 84

export function createTableColumns(input: Record<string, any>): ColumnDef<RowRecord>[] {
  const {
    selectingAll,
    t,
    allChecked,
    checked,
    setChecked,
    setSelectingAll,
    loadEveryRow,
    openRowMenu,
    pressOrigin,
    pressTimer,
    rowsRef,
    insertRow,
    dragItem,
    setDropTarget,
    setDrawerRowId,
    columns,
    table,
    membersQuery,
    rules,
    editing,
    invalidFor,
    spotlight,
    visible,
    selected,
    fill,
    cellWritable,
    dataReadOnly,
    focusCell,
    activateCell,
    tableId,
    targetRows,
    scheduleCell,
    clearInvalid,
    setEditing,
    queryClient,
    setMediaLibrary,
    openMediaPreview,
    requestMediaUpload,
    mediaUploadingKey,
    applyMediaCell,
    applyDateMode,
    beginFillRef,
    openCellMenu,
    refresh,
  } = input
  return [
    {
      id: 'select',
      header: () => (
        <div className="flex h-10 items-center gap-1 px-1">
          <span className="inline-flex size-3.5 shrink-0" aria-hidden="true" />
          <Checkbox
            aria-label={selectingAll ? t('selectingAll') : t('selectAll')}
            disabled={selectingAll}
            checked={allChecked ? true : checked.length > 0 ? 'indeterminate' : false}
            onCheckedChange={() => {
              if (allChecked) {
                setChecked([])
                return
              }
              setSelectingAll(true)
              void loadEveryRow()
                .then((loaded: any) => setChecked(loaded.map((row: any) => row.id)))
                .finally(() => setSelectingAll(false))
            }}
          />
        </div>
      ),
      size: GUTTER_WIDTH,
      cell: ({ row }) => (
        <div
          className="flex h-9 items-center gap-1 px-1"
          onContextMenu={(event) => openRowMenu(event, row.original)}
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse') return
            const point = { x: event.clientX, y: event.clientY }
            pressOrigin.current = point
            const rowRecord = row.original
            window.clearTimeout(pressTimer.current)
            pressTimer.current = window.setTimeout(() => {
              openRowMenu(
                { preventDefault() {}, clientX: point.x, clientY: point.y } as ReactMouseEvent,
                rowRecord,
              )
            }, 500)
          }}
          onPointerMove={(event) => {
            if (
              Math.hypot(
                event.clientX - pressOrigin.current.x,
                event.clientY - pressOrigin.current.y,
              ) > 10
            ) {
              window.clearTimeout(pressTimer.current)
            }
          }}
          onPointerUp={() => window.clearTimeout(pressTimer.current)}
          onPointerCancel={() => window.clearTimeout(pressTimer.current)}
        >
          <button
            type="button"
            aria-label={t('insertRow')}
            className="hidden text-muted-foreground md:inline-flex"
            onClick={(event) => {
              event.stopPropagation()
              void insertRow(rowsRef.current[row.index + 1]?.id)
            }}
          >
            <Plus className="size-3.5" />
          </button>
          <span
            role="button"
            tabIndex={-1}
            draggable
            aria-label={t('reorder')}
            className="inline-flex shrink-0 cursor-grab text-muted-foreground"
            onMouseDown={(event) => event.stopPropagation()}
            onDragStart={(event) => {
              event.stopPropagation()
              dragItem.current = { kind: 'row', id: row.original.id }
              event.dataTransfer.setData('text/plain', `row:${row.original.id}`)
              event.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={() => {
              dragItem.current = null
              setDropTarget(null)
            }}
          >
            <GripVertical className="size-3.5" />
          </span>
          <Checkbox
            aria-label={t('selectRowNumber', { number: row.original.rowNumber })}
            checked={checked.includes(row.original.id)}
            onCheckedChange={(next) => {
              setChecked((current: any) =>
                next === true
                  ? [...current, row.original.id]
                  : current.filter((id: any) => id !== row.original.id),
              )
            }}
          />

          <button
            type="button"
            aria-label={t('notes')}
            className={`inline-flex shrink-0 ${row.original.notes?.trim() ? 'text-foreground' : 'text-muted-foreground'}`}
            onClick={(event) => {
              event.stopPropagation()
              setDrawerRowId(row.original.id)
            }}
          >
            <ArrowUpRight className="size-3.5" />
          </button>
        </div>
      ),
    },
    ...columns.map((column: any) => ({
      id: column.id,
      header: column.name,
      size: column.width,
      cell: ({ row }: { row: { original: RowRecord; index: number } }) => {
        if (column.hidden) return <div className="h-9" />
        const presented = presentFormatRow(columns, row.original.cells, {
          tags: (table?.tags ?? []).map((tag: any) => ({ id: tag.id, name: tag.name })),
          statuses: (table?.statuses ?? []).map((status: any) => ({
            id: status.id,
            name: status.name,
          })),
          members: (membersQuery.data?.members ?? []).map((member: any) => ({
            id: member.userId,
            name: member.username,
          })),
        })
        const ruleStyle = conditionalStyle(
          rules,
          row.original.formats?.[column.id],
          row.original.cells,
          column.id,
          (expression) => matchesCondition(expression, presented[column.id] ?? null, presented),
        )
        const cellPaint = row.original.backgrounds?.[column.id] || ruleStyle.background
        const rowColor = row.original.color
        const painted =
          paintSwatch(cellPaint, 'background') ??
          rowTint(rowColor, paintSwatch(rowColor, 'background'))
        const stripe = !cellPaint && rowColor ? paintSwatch(rowColor, 'background') : undefined
        const active = editing === `${row.original.id}:${column.id}`
        const invalid = invalidFor(row.original.id, column.id)
        const mono =
          column.type === 'number' ||
          column.type === 'currency' ||
          column.type === 'formula' ||
          column.type === 'lookup'
        const lit =
          spotlight?.columnId === column.id &&
          (spotlight.rowId === row.original.id || !spotlight.rowId)
        const columnIndex = visible.findIndex((item: any) => item.id === column.id)
        const picked = selected.row === row.index && selected.column === columnIndex
        const inFill = Boolean(
          fill &&
          fill.columnId === column.id &&
          row.index >= Math.min(fill.from, fill.to) &&
          row.index <= Math.max(fill.from, fill.to),
        )
        const dateEditing = active && isDateColumnType(column.type)
        return (
          <div
            className={`relative flex h-9 min-w-0 items-center px-2 ${column.type === 'media' ? 'overflow-x-auto overflow-y-hidden' : dateEditing ? 'overflow-visible' : 'overflow-hidden'} ${mono ? 'font-mono' : ''} ${picked || lit ? 'ring-2 ring-inset ring-primary' : ''} ${inFill && !picked ? 'bg-accent' : ''}`}
            style={{
              color: paintSwatch(ruleStyle.color, 'text'),
              background: inFill && !picked ? undefined : painted,
              boxShadow: stripe ? `inset 3px 0 0 ${stripe}` : undefined,
              fontWeight: ruleStyle.bold ? 700 : 400,
            }}
            onContextMenu={(event) => openCellMenu(event, row.original, column)}
            onClick={(event) => {
              focusCell(row.index, columnIndex)
              if (isSelectFamilyType(column.type) && cellWritable(column) && !dataReadOnly) {
                activateCell(row.original, column)
                return
              }
              if (event.detail >= 2) activateCell(row.original, column)
            }}
          >
            <TableCellInput
              column={column}
              row={row.original}
              active={active}
              tableId={tableId}
              tags={table?.tags ?? []}
              statuses={table?.statuses ?? []}
              members={membersQuery.data?.members ?? []}
              relationRows={targetRows.data?.rows ?? []}
              readOnly={dataReadOnly}
              invalid={invalid}
              onScheduleCell={scheduleCell}
              onClearInvalid={(rowId, columnId) => clearInvalid(`cell:${rowId}:${columnId}`)}
              onDeactivate={() => setEditing(null)}
              onOpen={() => focusCell(row.index, columnIndex)}
              onActivate={() => activateCell(row.original, column)}
              onCreated={(kind, item) =>
                patchCachedTable(queryClient, tableId, (current) => ({
                  ...current,
                  tags:
                    kind === 'tag'
                      ? [...(current.tags ?? []).filter((tag) => tag.id !== item.id), item]
                      : current.tags,
                  statuses:
                    kind === 'status'
                      ? [
                          ...(current.statuses ?? []).filter((status) => status.id !== item.id),
                          item,
                        ]
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
                if (deleted) void refresh()
              }}
              onMediaLibrary={(existingIds) =>
                setMediaLibrary({ rowId: row.original.id, columnId: column.id, existingIds })
              }
              onMediaPreview={(file) => void openMediaPreview(file, row.original.id, column.id)}
              onMediaRequestUpload={() => requestMediaUpload(row.original.id, column.id)}
              onMediaUploading={mediaUploadingKey === `${row.original.id}:${column.id}`}
              onMediaCommit={(value) => applyMediaCell(row.original, column, value)}
              onDateMode={(patch) => void applyDateMode(column, patch)}
            />
            {picked && !active && fillable(column) ? (
              <button
                type="button"
                aria-label={t('fillHandle')}
                className="absolute bottom-0.5 right-0.5 z-10 flex size-3.5 cursor-crosshair items-center justify-center border border-primary bg-card text-primary"
                onPointerDown={(event) => beginFillRef.current(event, row.index, column)}
                onClick={(event) => event.stopPropagation()}
              >
                <Plus className="size-2.5" />
              </button>
            ) : null}
          </div>
        )
      },
    })),
  ]
}
