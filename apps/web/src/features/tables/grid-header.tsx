import type { Column, TableRecord } from '@datavalley/api-client'
import type { PresencePerson } from '@datavalley/shared'
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Filter, GripVertical, Plus, Star } from 'lucide-react'
import { type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { QuietInput } from '../../components/quiet-input'
import { ResourceIcon } from '../../components/resource-icon'
import type { ViewportAnchor } from '../../lib/place-in-viewport'
import { sync } from '../../lib/sync'
import { ColumnTitle } from './column-title'
import { beforeDropEdge } from './drop-place'
import { anchor, showEditError } from './grid-edit'
import { moveIdBefore } from './grid-model'
import { ColumnIcon, defaultIcon } from './icons'
import { GUTTER_WIDTH } from './table-columns'
import { PresenceChip } from '../realtime/presence-chip'
import { reportPresence } from '../realtime/presence-store'

const HEADER_CELL = 'bg-card'

export function columnHeaderClassName(pinned: boolean, selected: boolean, spotlight: boolean, ai: boolean) {
  return `group relative h-10 overflow-visible px-2 text-left font-medium ${pinned ? 'sticky z-20' : ''} ${selected ? 'bg-accent' : HEADER_CELL} ${spotlight ? 'ring-2 ring-inset ring-primary' : ''} ${ai ? 'ring-2 ring-inset ring-primary' : ''}`
}

type DropTarget = { kind: 'column' | 'row'; id: string } | null

type HeaderPopover = { kind: 'icon' | 'filter' | 'relation'; columnId: string } & ViewportAnchor

type GridHeaderProps = {
  gutter: ReactNode
  columns: Column[]
  gridColumns: Column[]
  widths: Record<string, number>
  filler: number
  pinnedColumnId: string | null
  selectedColumns: string[]
  sort: { columnId: string; direction: 'asc' | 'desc' } | null
  filterInput: Record<string, { op: string; value: string }>
  spotlight: { rowId: string; columnId: string } | null
  aiTableId: string | null
  aiColumnIds: string[]
  tableId: string
  tableName: string | null
  mainColumnId: string | null
  people: PresencePerson[]
  renamingColumn: string | null
  dataReadOnly: boolean
  projectTables: TableRecord[]
  dragItem: { current: { kind: 'column' | 'row'; id: string } | null }
  dropTarget: DropTarget
  pressOrigin: { current: { x: number; y: number } }
  pressTimer: { current: number }
  setDropTarget: (value: DropTarget | ((current: DropTarget) => DropTarget)) => void
  onResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>, column: Column) => void
  hideColumn: (column: Column, hidden: boolean) => void | Promise<void>
  reorderColumns: (ids: string[]) => void | Promise<void>
  chooseColumns: (event: ReactMouseEvent, columnId: string) => void
  openColumnMenu: (event: ReactMouseEvent, column: Column) => void
  scheduleColumnName: (column: Column, next: string) => void
  setRenamingColumn: (columnId: string | null) => void
  setPopover: (popover: HeaderPopover) => void
  setRelationTarget: (tableId: string) => void
  setRelationCardinality: (cardinality: string) => void
  cycleSort: (columnId: string) => void
  openNewColumn: (beforeId: string | undefined, point: ViewportAnchor) => void
}

export function GridHeader({
  gutter,
  columns,
  gridColumns,
  widths,
  filler,
  pinnedColumnId,
  selectedColumns,
  sort,
  filterInput,
  spotlight,
  aiTableId,
  aiColumnIds,
  tableId,
  tableName,
  mainColumnId,
  people,
  renamingColumn,
  dataReadOnly,
  projectTables,
  dragItem,
  dropTarget,
  pressOrigin,
  pressTimer,
  setDropTarget,
  onResizePointerDown,
  hideColumn,
  reorderColumns,
  chooseColumns,
  openColumnMenu,
  scheduleColumnName,
  setRenamingColumn,
  setPopover,
  setRelationTarget,
  setRelationCardinality,
  cycleSort,
  openNewColumn,
}: GridHeaderProps) {
  const { t } = useTranslation()
  return (
    <thead className="sticky top-0 z-20">
      <tr aria-rowindex={1}>
        <th className={`sticky left-0 z-30 h-10 p-0 text-left ${HEADER_CELL}`} style={{ width: GUTTER_WIDTH }}>
          {gutter}
        </th>
        {gridColumns.map((column) => {
          if (column.hidden) {
            return (
              <th
                key={column.id}
                data-column-id={column.id}
                className={`h-10 p-0 ${HEADER_CELL}`}
                style={{ width: widths[column.id] ?? column.width }}
              >
                <button
                  type="button"
                  aria-label={t('showColumn')}
                  className="inline-flex h-10 w-full items-center justify-center text-muted-foreground hover:text-foreground"
                  onClick={() => void hideColumn(column, false)}
                >
                  <Eye className="size-3.5" />
                </button>
              </th>
            )
          }
          const activeSort = sort?.columnId === column.id
          const filtered = Boolean(
            filterInput[column.id] &&
              (filterInput[column.id].op === 'empty' ||
                filterInput[column.id].op === 'not_empty' ||
                filterInput[column.id].value),
          )
          const columnSpotlight = Boolean(spotlight?.columnId === column.id && !spotlight.rowId)
          const columnAi = aiTableId === tableId && aiColumnIds.includes(column.id) && !columnSpotlight
          return (
            <th
              key={column.id}
              data-column-id={column.id}
              className={columnHeaderClassName(column.id === pinnedColumnId, selectedColumns.includes(column.id), columnSpotlight, columnAi)}
              style={{ width: widths[column.id] ?? column.width, left: column.id === pinnedColumnId ? GUTTER_WIDTH : undefined }}
              onDragOver={(event: DragEvent) => {
                const from = dragItem.current
                if (!from || from.kind !== 'column') return
                event.preventDefault()
                const next = beforeDropEdge(
                  gridColumns.map((item) => item.id),
                  from.id,
                  column.id,
                )
                  ? column.id
                  : null
                setDropTarget((current) => {
                  if (next === null) return current?.kind === 'column' ? null : current
                  if (current?.kind === 'column' && current.id === next) return current
                  return { kind: 'column', id: next }
                })
              }}
              onDrop={(event: DragEvent) => {
                event.preventDefault()
                const payload = event.dataTransfer.getData('text/plain')
                dragItem.current = null
                setDropTarget(null)
                if (!payload.startsWith('column:')) return
                void reorderColumns(
                  moveIdBefore(
                    gridColumns.map((item) => item.id),
                    payload.slice(7),
                    column.id,
                  ),
                )
              }}
              onClick={(event) => chooseColumns(event, column.id)}
              onContextMenu={(event) => openColumnMenu(event, column)}
              onPointerDown={(event) => {
                if (event.pointerType === 'mouse') return
                const point = { x: event.clientX, y: event.clientY }
                pressOrigin.current = point
                window.clearTimeout(pressTimer.current)
                pressTimer.current = window.setTimeout(() => {
                  openColumnMenu(
                    {
                      preventDefault() {},
                      clientX: point.x,
                      clientY: point.y,
                    } as ReactMouseEvent,
                    column,
                  )
                }, 500)
              }}
              onPointerMove={(event) => {
                if (Math.hypot(event.clientX - pressOrigin.current.x, event.clientY - pressOrigin.current.y) > 10) {
                  window.clearTimeout(pressTimer.current)
                }
              }}
              onPointerUp={() => window.clearTimeout(pressTimer.current)}
              onPointerCancel={() => window.clearTimeout(pressTimer.current)}
            >
              {dropTarget?.kind === 'column' && dropTarget.id === column.id ? (
                <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-20 w-0.5 bg-primary" />
              ) : null}
              <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                <span
                  role="button"
                  tabIndex={0}
                  draggable
                  aria-label={t('reorder')}
                  className="inline-flex shrink-0 cursor-grab text-muted-foreground"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') event.preventDefault()
                  }}
                  onDragStart={(event) => {
                    event.stopPropagation()
                    dragItem.current = { kind: 'column', id: column.id }
                    event.dataTransfer.setData('text/plain', `column:${column.id}`)
                    event.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => {
                    dragItem.current = null
                    setDropTarget(null)
                  }}
                >
                  <GripVertical className="size-3.5" />
                </span>
                <button
                  type="button"
                  aria-label={t('icon')}
                  className="text-muted-foreground"
                  onClick={(event) => {
                    event.stopPropagation()
                    setPopover({ kind: 'icon', columnId: column.id, ...anchor(event) })
                  }}
                >
                  <ColumnIcon name={String(column.config.icon ?? defaultIcon(column.type, column.config))} />
                </button>
                <PresenceChip
                  people={people.filter(
                    (person) =>
                      person.focus?.kind === 'columnName' &&
                      person.focus.tableId === tableId &&
                      person.focus.columnId === column.id,
                  )}
                  className="absolute -top-2 left-8 z-20"
                />
                {renamingColumn === column.id ? (
                  <QuietInput
                    autoFocus
                    label={t('rename')}
                    className="h-9 min-w-0 flex-1 bg-transparent leading-9 outline-none"
                    value={column.name}
                    onFocus={() =>
                      reportPresence({
                        tableId,
                        tableName,
                        focus: { kind: 'columnName', tableId, columnId: column.id },
                        editing: true,
                      })
                    }
                    onDraft={(next) => {
                      scheduleColumnName(column, next)
                      reportPresence({
                        tableId,
                        tableName,
                        focus: { kind: 'columnName', tableId, columnId: column.id },
                        editing: true,
                        draft: next,
                      })
                    }}
                    onFlush={() => {
                      void sync
                        .flush(`column:${column.id}:name`)
                        .catch(() => showEditError(t('error')))
                        .finally(() => {
                          setRenamingColumn(null)
                          reportPresence({ focus: null, editing: false, draft: null })
                        })
                    }}
                    onCancel={() => {
                      sync.cancel(`column:${column.id}:name`)
                      setRenamingColumn(null)
                      reportPresence({ focus: null, editing: false, draft: null })
                    }}
                  />
                ) : (
                  <ColumnTitle
                    name={
                      people.find(
                        (person) =>
                          person.focus?.kind === 'columnName' &&
                          person.focus.tableId === tableId &&
                          person.focus.columnId === column.id &&
                          person.draft != null,
                      )?.draft ?? column.name
                    }
                    type={column.type}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (event.shiftKey || event.metaKey || event.ctrlKey) {
                        chooseColumns(event, column.id)
                        return
                      }
                      setRenamingColumn(column.id)
                    }}
                  />
                )}
                {mainColumnId === column.id ? (
                  <Star aria-label={t('mainColumn')} className="size-3.5 shrink-0 fill-current" />
                ) : null}
                {column.type === 'relation' ? (
                  <button
                    type="button"
                    aria-label={t('targetTable')}
                    className="inline-flex min-w-0 max-w-[40%] shrink items-center gap-1 text-xs text-muted-foreground"
                    onClick={(event) => {
                      event.stopPropagation()
                      setRelationTarget(String(column.config.toTableId ?? ''))
                      setRelationCardinality(String(column.config.cardinality ?? 'many_to_one'))
                      setPopover({ kind: 'relation', columnId: column.id, ...anchor(event) })
                    }}
                  >
                    <ResourceIcon
                      name={projectTables.find((item) => item.id === column.config.toTableId)?.icon ?? 'Table'}
                      className="size-3.5 shrink-0"
                    />
                    <span className="truncate">
                      {projectTables.find((item) => item.id === column.config.toTableId)?.name ?? t('targetTable')}
                    </span>
                  </button>
                ) : null}
                <button
                  type="button"
                  data-header-control
                  aria-label={t('sort')}
                  className={` p-0.5 ${activeSort ? 'text-foreground' : 'text-muted-foreground'}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    cycleSort(column.id)
                  }}
                >
                  {activeSort && sort?.direction === 'desc' ? (
                    <ArrowDown className="size-3.5" />
                  ) : activeSort ? (
                    <ArrowUp className="size-3.5" />
                  ) : (
                    <ArrowUpDown className="size-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  data-header-control
                  aria-label={t('filter')}
                  className={` p-0.5 ${filtered ? 'text-foreground' : 'text-muted-foreground'}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    setPopover({ kind: 'filter', columnId: column.id, ...anchor(event) })
                  }}
                >
                  <Filter className="size-3.5" />
                </button>
              </div>
              <div
                role="separator"
                aria-label={t('resize')}
                className="absolute -right-1 top-0 z-10 h-[calc(100%-1.25rem)] w-2 cursor-col-resize"
                onPointerDown={(event) => onResizePointerDown(event, column)}
              />
              {!dataReadOnly ? (
                <button
                  type="button"
                  data-header-control
                  aria-label={t('insertColumn')}
                  className="absolute -right-2 bottom-0 z-10 flex size-4 items-center justify-center border border-border bg-card"
                  onClick={(event) => {
                    event.stopPropagation()
                    openNewColumn(columns[columns.findIndex((item) => item.id === column.id) + 1]?.id, anchor(event))
                  }}
                >
                  <Plus className="size-3" />
                </button>
              ) : null}
            </th>
          )
        })}
        <th className={`p-0 align-start ${HEADER_CELL}`} style={{ width: filler }}>
          {!dataReadOnly ? (
            <button
              type="button"
              aria-label={t('insertColumn')}
              className="inline-flex h-7 w-7 items-center justify-center hover:bg-accent"
              onClick={(event) => openNewColumn(undefined, anchor(event))}
            >
              <Plus className="size-3" />
            </button>
          ) : null}
        </th>
      </tr>
    </thead>
  )
}
