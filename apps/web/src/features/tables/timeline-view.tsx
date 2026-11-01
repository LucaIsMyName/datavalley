import type { Column, RowRecord } from '@datavalley/api-client'
import {
  dateColumnKind,
  formatDateCellValue,
  isDateColumnType,
  isDateRangeValue,
  formatTimelineBound,
  moveTimelineRange,
  offsetAtTime,
  parseTimelineCell,
  resizeTimelineRange,
  snapTimeline,
  timeAtOffset,
  timelineIncludesTime,
  timelineLayout,
  timelineNow,
  timelineStep,
  timelineWaterfallOrder,
  type TimelineDisplay,
  type TimelineSpan,
} from '@datavalley/shared'
import { ChevronDown, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DatePickerField, DateRangePickerField } from '../../components/date-picker-field'
import { Checkbox } from '../../components/ui/checkbox'
import { Label } from '../../components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../components/ui/select'
import { formatCell } from './cells'
import { presentFormatValue, type FormatLabels } from './format-values'
import { formatFormulaValue } from './formula-help'

const DAY = 86_400_000
const LANE = 40

type DragEdge = 'start' | 'end' | 'point' | 'move'

type DragState = {
  rowId: string
  edge: DragEdge
  time: number
  origin: number
}

export function TimelineView({
  columns,
  rows,
  tags,
  statuses,
  members,
  timeline,
  readOnly,
  truncated,
  loading,
  onChange,
  onWrite,
}: {
  columns: Column[]
  rows: RowRecord[]
  tags: { id: string; name: string }[]
  statuses: { id: string; name: string }[]
  members: { userId: string; username: string }[]
  timeline: TimelineDisplay
  readOnly: boolean
  truncated: boolean
  loading: boolean
  onChange: (timeline: TimelineDisplay) => void
  onWrite: (row: RowRecord, column: Column, value: unknown) => void
}) {
  const { t, i18n } = useTranslation()
  const seeded = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<{ time: number; offset: number } | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  const commitDragRef = useRef<(current: DragState) => void>(() => {})

  const dates = columns.filter((column) => isDateColumnType(column.type))
  const dateColumn = dates.find((column) => column.id === timeline.dateColumnId) ?? null
  const titleChoices = columns.filter((column) => column.id !== dateColumn?.id)
  const titleColumns = timeline.titleColumnIds.flatMap((id) => {
    const column = titleChoices.find((item) => item.id === id)
    return column ? [column] : []
  })
  const includeTime = dateColumn ? timelineIncludesTime(dateColumn) : false
  const range = Boolean(dateColumn?.config.range)
  const step = timelineStep(timeline.zoom, includeTime)
  const zoomMax = includeTime ? 5 : 4
  const zoom = Math.max(1, Math.min(zoomMax, Math.round(timeline.zoom) || 1))
  const ready = Boolean(dateColumn) && titleColumns.length > 0
  const labels = useMemo<FormatLabels>(
    () => ({
      tags,
      statuses,
      members: members.map((member) => ({ id: member.userId, name: member.username })),
    }),
    [members, statuses, tags],
  )

  useEffect(() => {
    if (seeded.current || columns.length === 0) return
    let dateColumnId = timeline.dateColumnId
    let titleColumnIds = timeline.titleColumnIds
    let changed = false
    if (!dateColumnId) {
      const first = columns.find((column) => isDateColumnType(column.type))
      if (first) {
        dateColumnId = first.id
        changed = true
      }
    }
    if (titleColumnIds.length === 0) {
      const text = columns.find((column) => (column.type === 'text' || column.type === 'long_text') && column.id !== dateColumnId)
      if (text) {
        titleColumnIds = [text.id]
        changed = true
      }
    }
    seeded.current = true
    if (changed) onChange({ ...timeline, dateColumnId, titleColumnIds })
  }, [columns, onChange, timeline])

  function setDragState(next: DragState | null) {
    dragRef.current = next
    setDrag(next)
  }

  const spans = useMemo(() => {
    if (!dateColumn) return []
    return rows.flatMap((row) => {
      const span = parseTimelineCell(row.cells[dateColumn.id], includeTime)
      return span ? [span] : []
    })
  }, [dateColumn, includeTime, rows])

  const layout = useMemo(
    () =>
      timelineLayout({
        spans,
        now: timelineNow(includeTime),
        step,
        includeTime,
        locale: i18n.language,
      }),
    [i18n.language, includeTime, spans, step],
  )

  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const anchor = anchorRef.current
    if (!scroller || !anchor) return
    anchorRef.current = null
    const x = offsetAtTime(anchor.time, layout.start, layout.end, layout.width)
    scroller.scrollLeft = Math.max(0, x - anchor.offset)
  }, [layout])

  const items = useMemo(() => {
    if (!dateColumn || titleColumns.length === 0) return []
    return rows.flatMap((row) => {
      const span = parseTimelineCell(row.cells[dateColumn.id], includeTime)
      if (!span) return []
      const shown = previewSpan(span, drag?.rowId === row.id ? drag : null, includeTime)
      return [{ row, span: shown, title: itemTitle(row, titleColumns, i18n.language, labels) }]
    })
  }, [dateColumn, drag, i18n.language, includeTime, labels, rows, titleColumns])
  const ordered = timelineWaterfallOrder(items.map((item) => item.span)).map((index) => items[index]).filter((item) => item != null)
  const unscheduled = dateColumn
    ? rows.filter((row) => parseTimelineCell(row.cells[dateColumn.id], includeTime) == null)
    : []
  const message = dates.length === 0 ? t('timelineNoDate') : titleChoices.length === 0 || titleColumns.length === 0 ? t('timelineNoTitle') : null
  const tickWidth = layout.ticks.length > 0 ? layout.width / layout.ticks.length : 0

  function timeFromPointer(clientX: number) {
    const node = contentRef.current
    if (!node) return null
    const x = clientX - node.getBoundingClientRect().left
    return snapTimeline(timeAtOffset(x, layout.start, layout.end, layout.width), step, includeTime)
  }

  function rememberAnchor(clientX?: number) {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || !content) return
    const localX = clientX == null ? scroller.scrollLeft + scroller.clientWidth / 2 : clientX - content.getBoundingClientRect().left
    const offset = clientX == null ? scroller.clientWidth / 2 : clientX - scroller.getBoundingClientRect().left
    anchorRef.current = { time: timeAtOffset(localX, layout.start, layout.end, layout.width), offset }
  }

  commitDragRef.current = (current) => {
    if (!dateColumn) return
    const row = rows.find((item) => item.id === current.rowId)
    if (!row) return
    const raw = row.cells[dateColumn.id]
    if (current.edge === 'point') {
      onWrite(row, dateColumn, formatTimelineBound(current.time, includeTime))
      return
    }
    if (current.edge === 'move') {
      if (!isDateRangeValue(raw)) return
      const delta = current.time - current.origin
      if (delta === 0) return
      const moved = moveTimelineRange({ from: raw.from, to: raw.to, delta, includeTime })
      if (moved.ok) onWrite(row, dateColumn, moved.value)
      return
    }
    if (!isDateRangeValue(raw)) return
    const result = resizeTimelineRange({
      from: raw.from,
      to: raw.to,
      edge: current.edge,
      time: current.time,
      includeTime,
    })
    if (result.ok) onWrite(row, dateColumn, result.value)
  }

  function beginDrag(event: React.PointerEvent, rowId: string, edge: DragEdge) {
    if (readOnly) return
    const time = timeFromPointer(event.clientX)
    if (time == null) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const next = { rowId, edge, time, origin: time }
    setDragState(next)
    function move(pointer: PointerEvent) {
      const snapped = timeFromPointer(pointer.clientX)
      const current = dragRef.current
      if (snapped == null || !current) return
      setDragState({ ...current, time: snapped })
    }
    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const current = dragRef.current
      setDragState(null)
      if (current) commitDragRef.current(current)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const zoomRef = useRef({ zoom, zoomMax, timeline, layout, ready })
  zoomRef.current = { zoom, zoomMax, timeline, layout, ready }
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const node = scrollRef.current
    if (!node || !ready) return
    let bucket = 0
    let gestureStart = zoomRef.current.zoom
    function zoomBy(direction: number, clientX: number) {
      const current = zoomRef.current
      const level = Math.round(current.zoom) || 1
      const next = Math.max(1, Math.min(current.zoomMax, level + direction))
      if (next === level) return
      zoomRef.current = { ...current, zoom: next }
      const content = contentRef.current
      const scroller = scrollRef.current
      if (content && scroller) {
        const localX = clientX - content.getBoundingClientRect().left
        anchorRef.current = {
          time: timeAtOffset(localX, current.layout.start, current.layout.end, current.layout.width),
          offset: clientX - scroller.getBoundingClientRect().left,
        }
      }
      onChangeRef.current({ ...current.timeline, zoom: next })
    }
    function onWheel(event: WheelEvent) {
      const pinch = event.ctrlKey || event.metaKey
      if (!pinch && Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
      event.preventDefault()
      bucket += event.deltaY
      if (Math.abs(bucket) < (pinch ? 8 : 40)) return
      const direction = bucket < 0 ? 1 : -1
      bucket = 0
      zoomBy(direction, event.clientX)
    }
    function onGestureStart(event: Event) {
      event.preventDefault()
      gestureStart = zoomRef.current.zoom
    }
    function onGestureChange(event: Event) {
      event.preventDefault()
      const gesture = event as Event & { scale?: number; clientX?: number }
      const steps = Math.round(Math.log(gesture.scale ?? 1) / Math.log(1.12))
      const target = Math.max(1, Math.min(zoomRef.current.zoomMax, Math.round(gestureStart) + steps))
      zoomBy(target - (Math.round(zoomRef.current.zoom) || 1), gesture.clientX ?? 0)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    node.addEventListener('gesturestart', onGestureStart)
    node.addEventListener('gesturechange', onGestureChange)
    return () => {
      node.removeEventListener('wheel', onWheel)
      node.removeEventListener('gesturestart', onGestureStart)
      node.removeEventListener('gesturechange', onGestureChange)
    }
  }, [ready])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-12 min-w-0 shrink-0 items-center gap-3 overflow-x-auto border-b border-border px-3">
        <div className="flex w-52 shrink-0 items-center gap-2">
          <span className="shrink-0 text-sm">{t('timelineDate')}</span>
          <Select
            value={dateColumn?.id ?? ''}
            onValueChange={(value) =>
              onChange({
                ...timeline,
                dateColumnId: value || null,
                titleColumnIds: timeline.titleColumnIds.filter((id) => id !== value),
              })
            }
          >
            <SelectTrigger aria-label={t('timelineDate')} className="min-w-0 flex-1" disabled={dates.length === 0} />
            <SelectContent>
              {dates.map((column) => (
                <SelectItem key={column.id} value={column.id}>
                  {column.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ColumnMultiSelect
          label={t('timelineTitles')}
          columns={titleChoices}
          selected={titleColumns.map((column) => column.id)}
          onToggle={(id) =>
            onChange({
              ...timeline,
              titleColumnIds: timeline.titleColumnIds.includes(id)
                ? timeline.titleColumnIds.filter((item) => item !== id)
                : [...timeline.titleColumnIds, id],
            })
          }
        />
        <Label className="flex shrink-0 items-center gap-2 font-normal">
          {t('timelineZoom')}
          <input
            type="range"
            min={1}
            max={zoomMax}
            step={1}
            value={zoom}
            aria-label={t('timelineZoom')}
            disabled={!ready}
            className="h-2 w-28 accent-primary disabled:opacity-50"
            onChange={(event) => {
              rememberAnchor()
              onChange({ ...timeline, zoom: Number(event.target.value) })
            }}
          />
        </Label>
      </div>
      {truncated ? <p className="border-b border-border px-3 py-2 text-sm text-muted-foreground">{t('chartTruncated', { count: rows.length })}</p> : null}
      {loading ? <p className="sr-only">{t('loading')}</p> : null}
      {!dateColumn || titleColumns.length === 0 ? (
        <p className="px-3 py-6 text-sm text-muted-foreground">{message}</p>
      ) : (
        <>
          <div ref={scrollRef} className="min-h-0 min-w-0 flex-1 overflow-auto">
            <div ref={contentRef} className="relative min-w-full" style={{ width: layout.width }}>
              <div className="sticky top-0 z-20 h-8 border-b border-border bg-card">
                {layout.ticks.map((tick) => (
                  <div
                    key={tick.at}
                    className="absolute top-0 h-full overflow-hidden border-l border-border pl-1 text-xs leading-8 text-muted-foreground"
                    style={{ left: offsetAtTime(tick.at, layout.start, layout.end, layout.width), width: tickWidth }}
                  >
                    {tick.label}
                  </div>
                ))}
              </div>
              <div className="relative" style={{ height: Math.max(ordered.length, 1) * LANE }}>
                {ordered.map((item, index) => {
                  const left = offsetAtTime(item.span.start, layout.start, layout.end, layout.width)
                  const right = offsetAtTime(item.span.point ? item.span.start : item.span.end, layout.start, layout.end, layout.width)
                  const width = Math.max(item.span.point ? 12 : 16, right - left)
                  const top = index * LANE
                  const labelInside = !item.span.point && width >= 96
                  return (
                    <div key={item.row.id} className="absolute right-0 left-0 border-b border-border/40" style={{ top, height: LANE }}>
                      <div className="absolute top-2 flex h-6 items-center" style={{ left: item.span.point ? left - 6 : left }}>
                        {item.span.point ? (
                          <button
                            type="button"
                            aria-label={item.title}
                            className="size-3 shrink-0 rounded-full bg-primary"
                            style={{ cursor: readOnly ? 'default' : 'grab' }}
                            onPointerDown={(event) => beginDrag(event, item.row.id, 'point')}
                            onPointerCancel={() => setDragState(null)}
                          />
                        ) : (
                          <div
                            aria-label={t('timelineMove')}
                            className="relative h-full shrink-0 border border-primary bg-primary/15"
                            style={{ width, cursor: readOnly ? 'default' : 'grab' }}
                            onPointerDown={(event) => {
                              if ((event.target as HTMLElement).closest('button')) return
                              beginDrag(event, item.row.id, 'move')
                            }}
                          >
                            {labelInside ? <span className="block truncate px-2 text-xs leading-6">{item.title}</span> : null}
                            {readOnly ? null : (
                              <>
                                <button
                                  type="button"
                                  aria-label={t('timelineStart')}
                                  className="absolute top-0 left-0 h-full w-2 cursor-ew-resize bg-primary"
                                  onPointerDown={(event) => beginDrag(event, item.row.id, 'start')}
                                  onPointerCancel={() => setDragState(null)}
                                />
                                <button
                                  type="button"
                                  aria-label={t('timelineEnd')}
                                  className="absolute top-0 right-0 h-full w-2 cursor-ew-resize bg-primary"
                                  onPointerDown={(event) => beginDrag(event, item.row.id, 'end')}
                                  onPointerCancel={() => setDragState(null)}
                                />
                              </>
                            )}
                          </div>
                        )}
                        {labelInside ? null : <span className="pointer-events-none max-w-40 truncate pl-1 text-xs">{item.title}</span>}
                        {readOnly ? null : (
                          <button
                            type="button"
                            aria-label={t('clearCell')}
                            className="inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                            onClick={() => onWrite(item.row, dateColumn, null)}
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
                <div
                  className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-primary"
                  style={{ left: offsetAtTime(layout.now, layout.start, layout.end, layout.width) }}
                  title={t('timelineNow')}
                />
              </div>
            </div>
          </div>
          {unscheduled.length > 0 ? (
            <div className="h-40 shrink-0 overflow-auto border-t border-border">
              <p className="sticky top-0 border-b border-border bg-card px-3 py-2 text-sm text-muted-foreground">{t('timelineUnscheduled')}</p>
              {unscheduled.map((row) => {
                const raw = dateColumn ? row.cells[dateColumn.id] : null
                return (
                <div key={row.id} className="flex min-h-12 items-center gap-3 border-b border-border px-3">
                  <span className="min-w-0 flex-1 truncate text-sm">{itemTitle(row, titleColumns, i18n.language, labels)}</span>
                  {readOnly || !dateColumn ? (
                    <span className="text-sm text-muted-foreground">{t('empty')}</span>
                  ) : (
                    <div className="flex w-64 shrink-0 items-center gap-2">
                      {range ? (
                        <DateRangePickerField
                          label={dateColumn.name}
                          kind={dateColumnKind(dateColumn)}
                          language={i18n.language}
                          value={isDateRangeValue(raw) ? raw : null}
                          autoOpen={false}
                          onChange={(next) => onWrite(row, dateColumn, next)}
                        />
                      ) : (
                        <DatePickerField
                          label={dateColumn.name}
                          kind={dateColumnKind(dateColumn)}
                          language={i18n.language}
                          value={typeof raw === 'string' ? raw : ''}
                          autoOpen={false}
                          onChange={(next) => onWrite(row, dateColumn, next || null)}
                        />
                      )}
                      <button type="button" aria-label={t('clearCell')} className="inline-flex size-8 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground" onClick={() => onWrite(row, dateColumn, null)}>
                        <X className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function previewSpan(span: TimelineSpan, drag: DragState | null, includeTime: boolean): TimelineSpan {
  if (!drag) return span
  if (drag.edge === 'point') return { start: drag.time, end: drag.time, point: true }
  if (drag.edge === 'move') {
    const delta = drag.time - drag.origin
    return { start: span.start + delta, end: span.end + delta, point: false }
  }
  if (drag.edge === 'start') {
    const limit = includeTime ? span.end : span.end - DAY
    return { ...span, start: Math.min(drag.time, limit) }
  }
  const end = includeTime ? drag.time : drag.time + DAY
  return { ...span, end: Math.max(end, includeTime ? span.start : span.start + DAY) }
}

function itemTitle(row: RowRecord, columns: Column[], language: string, labels: FormatLabels) {
  const parts = columns.map((column) => titlePart(column, row.cells[column.id], language, labels)).filter((part) => part.length > 0)
  return parts.length > 0 ? parts.join(' · ') : String(row.rowNumber)
}

function titlePart(column: Column, value: unknown, language: string, labels: FormatLabels) {
  if (value == null || value === '') return ''
  if (isDateColumnType(column.type)) return formatDateCellValue(value, column, language)
  if (column.type === 'formula') return formatFormulaValue(value)
  if (column.type === 'number' || column.type === 'currency') return formatCell(column, value, language)
  const presented = presentFormatValue(column, value, labels)
  if (presented == null) return ''
  if (Array.isArray(presented)) return presented.map((item) => formatFormulaValue(item)).filter((item) => item.length > 0).join(', ')
  if (typeof presented === 'boolean') return presented ? 'TRUE' : 'FALSE'
  if (typeof presented === 'object') return formatFormulaValue(presented)
  return String(presented)
}

function ColumnMultiSelect({
  label,
  columns,
  selected,
  onToggle,
}: {
  label: string
  columns: { id: string; name: string }[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  const { t } = useTranslation()
  const names = columns.filter((column) => selected.includes(column.id)).map((column) => column.name)
  return (
    <div className="flex w-52 shrink-0 items-center gap-2">
      <span className="shrink-0 text-sm">{label}</span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            disabled={columns.length === 0}
            className="flex h-9 min-w-0 flex-1 items-center justify-between gap-2 border border-border bg-card px-2 text-left text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
          >
            <span className="truncate">{names.length > 0 ? names.join(', ') : t('none')}</span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="max-h-72 w-[var(--radix-popover-trigger-width)] min-w-44 overflow-auto p-1">
          {columns.map((column) => (
            <Label key={column.id} className="flex min-h-9 cursor-pointer items-center gap-2 px-2 font-normal hover:bg-accent">
              <Checkbox checked={selected.includes(column.id)} onCheckedChange={() => onToggle(column.id)} />
              <span className="truncate">{column.name}</span>
            </Label>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  )
}
