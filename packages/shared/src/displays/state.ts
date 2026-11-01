import { isDateColumnType } from '../dates/column.js'

export const displayModes = ['grid', 'chart', 'timeline', 'kanban'] as const
export const chartTypes = ['line', 'bar', 'doughnut'] as const
export const chartDimensionTypes = ['status', 'tags', 'text', 'mail', 'url'] as const
export const chartValueTypes = ['number', 'formula'] as const

export type DisplayMode = (typeof displayModes)[number]
export type ChartType = (typeof chartTypes)[number]
export type ChartDimensionType = (typeof chartDimensionTypes)[number]
export type ChartValueType = (typeof chartValueTypes)[number]

export type ChartDisplay = {
  type: ChartType
  dimensionIds: string[]
  valueIds: string[]
  perRow: boolean
}

export type TimelineDisplay = {
  dateColumnId: string | null
  titleColumnIds: string[]
  zoom: number
}

export type KanbanDisplay = {
  statusColumnId: string | null
  cardColumnIds: string[]
  statusOrder: string[]
}

export type TableDisplayState = {
  mode: DisplayMode
  chart: ChartDisplay
  timeline: TimelineDisplay
  kanban: KanbanDisplay
}

export type DisplayColumn = {
  id: string
  type: string
}

const idLimit = 24

export function defaultTableDisplay(): TableDisplayState {
  return {
    mode: 'grid',
    chart: { type: 'bar', dimensionIds: [], valueIds: [], perRow: false },
    timeline: { dateColumnId: null, titleColumnIds: [], zoom: 1 },
    kanban: { statusColumnId: null, cardColumnIds: [], statusOrder: [] },
  }
}

export function isChartDimensionType(type: string): type is ChartDimensionType {
  return (chartDimensionTypes as readonly string[]).includes(type)
}

export function isChartValueType(type: string): type is ChartValueType {
  return (chartValueTypes as readonly string[]).includes(type)
}

function idList(value: unknown) {
  if (!Array.isArray(value)) return []
  const ids: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0 || item.length > 80) continue
    if (ids.includes(item)) continue
    ids.push(item)
    if (ids.length >= idLimit) break
  }
  return ids
}

function optionalId(value: unknown) {
  return typeof value === 'string' && value.length > 0 && value.length <= 80 ? value : null
}

export function sanitizeTableDisplay(value: unknown): TableDisplayState {
  const base = defaultTableDisplay()
  if (!value || typeof value !== 'object') return base
  const raw = value as Record<string, unknown>
  const mode = (displayModes as readonly string[]).includes(String(raw.mode)) ? (raw.mode as DisplayMode) : base.mode
  const chart = raw.chart && typeof raw.chart === 'object' ? (raw.chart as Record<string, unknown>) : {}
  const timeline = raw.timeline && typeof raw.timeline === 'object' ? (raw.timeline as Record<string, unknown>) : {}
  const kanban = raw.kanban && typeof raw.kanban === 'object' ? (raw.kanban as Record<string, unknown>) : {}
  const zoom = typeof timeline.zoom === 'number' && Number.isFinite(timeline.zoom) ? timeline.zoom : base.timeline.zoom
  return {
    mode,
    chart: {
      type: chart.type === 'line' || chart.type === 'doughnut' || chart.type === 'bar' ? chart.type : base.chart.type,
      dimensionIds: idList(chart.dimensionIds),
      valueIds: idList(chart.valueIds),
      perRow: chart.perRow === true,
    },
    timeline: {
      dateColumnId: optionalId(timeline.dateColumnId),
      titleColumnIds: idList(timeline.titleColumnIds),
      zoom,
    },
    kanban: {
      statusColumnId: optionalId(kanban.statusColumnId),
      cardColumnIds: idList(kanban.cardColumnIds),
      statusOrder: idList(kanban.statusOrder),
    },
  }
}

export function normalizeTableDisplay(value: unknown, columns: DisplayColumn[]): TableDisplayState {
  const clean = sanitizeTableDisplay(value)
  const dimensions = new Set(columns.filter((column) => isChartDimensionType(column.type)).map((column) => column.id))
  const values = new Set(columns.filter((column) => isChartValueType(column.type)).map((column) => column.id))
  const known = new Set(columns.map((column) => column.id))
  const dateColumnId = clean.timeline.dateColumnId && columns.some((column) => column.id === clean.timeline.dateColumnId && isDateColumnType(column.type)) ? clean.timeline.dateColumnId : null
  return {
    ...clean,
    chart: {
      ...clean.chart,
      dimensionIds: clean.chart.dimensionIds.filter((id) => dimensions.has(id)),
      valueIds: clean.chart.valueIds.filter((id) => values.has(id)),
    },
    timeline: {
      ...clean.timeline,
      dateColumnId,
      titleColumnIds: clean.timeline.titleColumnIds.filter((id) => known.has(id) && id !== dateColumnId),
    },
  }
}
