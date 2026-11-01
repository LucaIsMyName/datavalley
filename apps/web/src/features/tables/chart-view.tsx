import { barY, defineChart, group, lineY } from '@tanstack/charts'
import { pie, polar, radialArc } from '@tanstack/charts/polar'
import { Chart } from '@tanstack/charts/react'
import { scaleBand } from '@tanstack/charts/scales/band'
import { scaleLinear } from '@tanstack/charts/scales/linear'
import { scalePoint } from '@tanstack/charts/scales/point'
import { tooltip } from '@tanstack/charts/tooltip'
import {
  aggregateChart,
  chartTypes,
  isChartDimensionType,
  isChartValueType,
  type ChartDimensionInput,
  type ChartDisplay,
  type ChartType,
} from '@datavalley/shared'
import { ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '../../components/ui/checkbox'
import { Label } from '../../components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../components/ui/select'

const seriesPalette = ['#1c0f6e', '#0f766e', '#b45309', '#9f2d2d', '#1d4ed8', '#6d28d9', '#be185d', '#3f6212']

const swatchFill: Record<string, string> = {
  amber: '#d97706',
  green: '#15803d',
  blue: '#1d4ed8',
  red: '#b91c1c',
  violet: '#6d28d9',
  orange: '#c2410c',
  pink: '#be185d',
  teal: '#0f766e',
  slate: '#475569',
  yellow: '#a16207',
}

type PlotPoint = {
  category: string
  label: string
  series: string
  amount: number
  fill: string
}

type Catalog = { id: string; name: string; color: string; position?: string }

function paint(color: string | null, seriesIndex: number) {
  if (color && swatchFill[color]) return swatchFill[color]
  return seriesPalette[seriesIndex % seriesPalette.length]
}

function formatAmount(value: number, locale: string) {
  return new Intl.NumberFormat(locale.startsWith('de') ? 'de-DE' : 'en-US', { maximumFractionDigits: 2 }).format(value)
}

function usePlotSize() {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => {
      const next = Math.floor(node.clientHeight) - 24
      if (next > 0) setHeight(next)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return { ref, height }
}

function CategoryPlot({ points, type, height, locale, label }: { points: PlotPoint[]; type: 'line' | 'bar'; height: number; locale: string; label: string }) {
  const seriesCount = new Set(points.map((point) => point.series)).size
  const labels = useMemo(() => new Map(points.map((point) => [point.category, point.label])), [points])
  const definition = useMemo(() => {
    const shared = {
      x: 'category' as const,
      y: 'amount' as const,
      z: 'series' as const,
      key: (row: PlotPoint) => `${row.category}:${row.series}`,
    }
    const marks =
      type === 'bar'
        ? [
            barY(points, {
              ...shared,
              fill: (row: PlotPoint) => row.fill,
              layout: seriesCount > 1 ? group({ padding: 0.2 }) : undefined,
            }),
          ]
        : [
            lineY(points, {
              ...shared,
              stroke: (row: PlotPoint) => row.fill,
              points: true,
            }),
          ]
    return defineChart(
      {
        marks,
        scales: {
          x: {
            scale: () => (type === 'bar' ? scaleBand<string>().padding(0.18) : scalePoint<string>().padding(0.2)),
            axis: { ticks: { format: (value: string) => labels.get(value) ?? value } },
          },
          y: {
            scale: scaleLinear,
            nice: true,
            grid: true,
            axis: { ticks: { format: (value: number) => formatAmount(value, locale) } },
          },
        },
      },
      {
        tooltip: {
          use: tooltip,
          format: (point: { datum: PlotPoint }) =>
            `${point.datum.label}${seriesCount > 1 ? ` · ${point.datum.series}` : ''}: ${formatAmount(point.datum.amount, locale)}`,
        },
      },
    )
  }, [labels, locale, points, seriesCount, type])
  return <Chart definition={definition} height={height} ariaLabel={label} />
}

function DoughnutPlot({ points, height, locale, label }: { points: PlotPoint[]; height: number; locale: string; label: string }) {
  const slices = useMemo(() => pie(points.filter((point) => point.amount > 0), { value: 'amount' }), [points])
  const definition = useMemo(
    () =>
      defineChart(
        {
          marks: [
            polar({
              inset: 8,
              radiusRatio: 0.82,
              marks: [
                radialArc(slices, {
                  innerRadius: ({ radius }: { radius: number }) => radius * 0.58,
                  fill: (row: (typeof slices)[number]) => row.fill,
                  key: 'category',
                }),
              ],
              scales: { angle: null, radius: null },
            }),
          ],
          scales: { x: null, y: null },
        },
        {
          tooltip: {
            use: tooltip,
            format: (point: { datum: PlotPoint }) => `${point.datum.label}: ${formatAmount(point.datum.amount, locale)}`,
          },
        },
      ),
    [locale, slices],
  )
  if (slices.length === 0) return null
  return <Chart definition={definition} height={height} ariaLabel={label} />
}

export function ChartView({
  columns,
  rows,
  tags,
  statuses,
  chart,
  truncated,
  loading,
  onChange,
}: {
  columns: { id: string; name: string; type: string }[]
  rows: { id?: string; cells: Record<string, unknown> }[]
  tags: Catalog[]
  statuses: Catalog[]
  chart: ChartDisplay
  truncated: boolean
  loading: boolean
  onChange: (chart: ChartDisplay) => void
}) {
  const { t, i18n } = useTranslation()
  const { ref, height } = usePlotSize()
  const dimensions = columns.filter((column) => isChartDimensionType(column.type))
  const values = columns.filter((column) => isChartValueType(column.type))
  const selectedDimensions = chart.dimensionIds.filter((id) => dimensions.some((column) => column.id === id))
  const selectedValues = chart.valueIds.filter((id) => values.some((column) => column.id === id))
  const ready = selectedDimensions.length > 0 && selectedValues.length > 0

  function toggle(kind: 'dimensionIds' | 'valueIds', id: string) {
    const current = chart[kind]
    onChange({
      ...chart,
      [kind]: current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    })
  }

  const aggregate = useMemo(() => {
    if (!ready) return null
    const dimensionInputs: ChartDimensionInput[] = selectedDimensions.flatMap((id) => {
      const column = dimensions.find((item) => item.id === id)
      if (!column || !isChartDimensionType(column.type)) return []
      const entries = column.type === 'status' ? statuses : column.type === 'tags' ? tags : []
      return [
        {
          id: column.id,
          type: column.type,
          entries: entries.map((entry) => ({
            id: entry.id,
            label: entry.name,
            color: entry.color,
            position: entry.position,
          })),
        },
      ]
    })
    return aggregateChart({
      dimensions: dimensionInputs,
      values: selectedValues.flatMap((id) => {
        const column = values.find((item) => item.id === id)
        return column ? [{ id: column.id, name: column.name }] : []
      }),
      rows,
      emptyLabel: t('empty'),
      perRow: chart.perRow,
    })
  }, [chart.perRow, dimensions, ready, rows, selectedDimensions, selectedValues, statuses, t, tags, values])

  const categoryColor = Boolean(aggregate?.categories.some((category) => category.color))
  const points = useMemo<PlotPoint[]>(() => {
    if (!aggregate) return []
    return aggregate.series.flatMap((series, seriesIndex) =>
      aggregate.categories.map((category, index) => ({
        category: category.key,
        label: category.label,
        series: series.name,
        amount: series.values[index] ?? 0,
        fill: paint(category.color, seriesIndex),
      })),
    )
  }, [aggregate])
  const legend = useMemo(() => {
    const seen = new Set<string>()
    const items: { label: string; fill: string }[] = []
    for (const point of points) {
      const label = categoryColor ? point.label : point.series
      if (seen.has(label)) continue
      seen.add(label)
      items.push({ label, fill: point.fill })
    }
    return items.length > 1 && items.length <= 16 ? items : []
  }, [categoryColor, points])

  const message =
    dimensions.length === 0
      ? t('chartNoDimensions')
      : values.length === 0
        ? t('chartNoValues')
        : !ready
          ? t('chartPick')
          : rows.length === 0
            ? t('chartNoRows')
            : null
  const doughnuts = chart.type === 'doughnut' && aggregate ? aggregate.series : []

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-12 min-w-0 shrink-0 items-center gap-3 overflow-x-auto border-b border-border px-3">
        <div className="flex shrink-0 items-center gap-2">
          <span className="shrink-0 text-sm">{t('chartType')}</span>
          <Select value={chart.type} onValueChange={(value) => onChange({ ...chart, type: value as ChartType })}>
            <SelectTrigger aria-label={t('chartType')} className="w-32" />
            <SelectContent>
              {chartTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(type === 'line' ? 'chartLine' : type === 'bar' ? 'chartBar' : 'chartDoughnut')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Label className="flex shrink-0 items-center gap-2 font-normal">
          <Checkbox checked={chart.perRow} onCheckedChange={(checked) => onChange({ ...chart, perRow: checked === true })} />
          {t('chartPerRow')}
        </Label>
        <ColumnMultiSelect
          label={t('chartDimensions')}
          columns={dimensions}
          selected={selectedDimensions}
          onToggle={(id) => toggle('dimensionIds', id)}
        />
        <ColumnMultiSelect
          label={t('chartValues')}
          columns={values}
          selected={selectedValues}
          onToggle={(id) => toggle('valueIds', id)}
        />
      </div>
      {truncated ? <p className="border-b border-border px-3 py-2 text-sm text-muted-foreground">{t('chartTruncated', { count: rows.length })}</p> : null}
      {loading ? <p className="sr-only">{t('loading')}</p> : null}
      {legend.length > 0 && !message ? (
        <ul className="flex shrink-0 flex-wrap gap-x-4 gap-y-2 border-b border-border px-3 py-2">
          {legend.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-sm">
              <span className="size-3 shrink-0" style={{ backgroundColor: item.fill }} />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div ref={ref} className="min-h-0 flex-1 overflow-hidden p-3">
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        {!message && height > 0 && chart.type !== 'doughnut' ? (
          <CategoryPlot points={points} type={chart.type} height={height} locale={i18n.language} label={t('displayChart')} />
        ) : null}
        {!message && height > 0 && chart.type === 'doughnut' ? (
          <div className={`grid h-full gap-4 ${doughnuts.length > 1 ? 'md:grid-cols-2' : ''}`}>
            {doughnuts.map((series) => {
              const seriesPoints = points.filter((point) => point.series === series.name && point.amount > 0)
              const plotHeight = Math.max(160, height - (doughnuts.length > 1 ? 28 : 0))
              return (
                <section key={series.columnId} className="min-h-0 min-w-0">
                  {doughnuts.length > 1 ? <h2 className="mb-2 text-sm font-medium">{series.name}</h2> : null}
                  {seriesPoints.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('chartNoPositive')}</p>
                  ) : (
                    <DoughnutPlot points={seriesPoints} height={plotHeight} locale={i18n.language} label={series.name} />
                  )}
                </section>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
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
