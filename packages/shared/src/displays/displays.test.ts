import { describe, expect, it } from 'vitest'
import { aggregateChart, chartCategoryPalette, chartMarkColor } from './chart.js'
import { defaultTableDisplay, normalizeTableDisplay, sanitizeTableDisplay } from './state.js'

const status = {
  id: 'status',
  type: 'status' as const,
  entries: [
    { id: 'open', label: 'Open', color: 'amber', position: 'a0' },
    { id: 'done', label: 'Done', color: 'green', position: 'a1' },
  ],
}
const tags = {
  id: 'tags',
  type: 'tags' as const,
  entries: [
    { id: 'red', label: 'Red', color: 'red' },
    { id: 'blue', label: 'Blue', color: 'blue' },
  ],
}

describe('chart aggregation', () => {
  it('sums rows that share a dimension and keeps status order and color', () => {
    const chart = aggregateChart({
      dimensions: [status],
      values: [{ id: 'amount', name: 'Amount' }],
      emptyLabel: 'Empty',
      rows: [
        { cells: { status: 'done', amount: 2 } },
        { cells: { status: 'open', amount: 5 } },
        { cells: { status: 'open', amount: 1 } },
        { cells: { status: null, amount: 4 } },
      ],
    })
    expect(chart.categories.map((category) => [category.label, category.color])).toEqual([
      ['Open', 'amber'],
      ['Done', 'green'],
      ['Empty', null],
    ])
    expect(chart.series).toEqual([{ columnId: 'amount', name: 'Amount', values: [6, 2, 4] }])
  })

  it('joins dimensions and fans a row out across each tag', () => {
    const chart = aggregateChart({
      dimensions: [status, tags],
      values: [
        { id: 'amount', name: 'Amount' },
        { id: 'extra', name: 'Extra' },
      ],
      emptyLabel: 'Empty',
      rows: [{ cells: { status: 'open', tags: ['red', 'blue'], amount: 3, extra: 1 } }],
    })
    expect(chart.categories.map((category) => category.label)).toEqual(['Open · Blue', 'Open · Red'])
    expect(chart.categories.every((category) => category.color == null)).toBe(true)
    expect(chart.series.map((series) => series.values)).toEqual([
      [3, 3],
      [1, 1],
    ])
  })

  it('skips formula text and errors and still keeps the category', () => {
    const chart = aggregateChart({
      dimensions: [{ id: 'name', type: 'text' }],
      values: [{ id: 'total', name: 'Total' }],
      emptyLabel: 'Empty',
      rows: [
        { cells: { name: 'Ada', total: 8 } },
        { cells: { name: 'Ada', total: '8' } },
        { cells: { name: 'Ada', total: { error: '#N/A' } } },
        { cells: { name: 'Grace', total: Number.NaN } },
      ],
    })
    expect(chart.categories.map((category) => category.label)).toEqual(['Ada', 'Grace'])
    expect(chart.series[0].values).toEqual([8, 0])
  })

  it('keeps each row when the same dimension value repeats', () => {
    const rows = [
      { id: 'a', cells: { name: 'Ada', amount: 2 } },
      { id: 'b', cells: { name: 'Ada', amount: 3 } },
    ]
    const dimensions = [{ id: 'name', type: 'text' as const }]
    const values = [{ id: 'amount', name: 'Amount' }]
    const grouped = aggregateChart({ dimensions, values, emptyLabel: 'Empty', rows })
    const separate = aggregateChart({ dimensions, values, emptyLabel: 'Empty', rows, perRow: true })
    expect(grouped.categories.map((category) => category.label)).toEqual(['Ada'])
    expect(grouped.series[0].values).toEqual([5])
    expect(separate.categories.map((category) => category.label)).toEqual(['Ada', 'Ada'])
    expect(separate.series[0].values).toEqual([2, 3])
    expect(new Set(separate.categories.map((category) => category.key)).size).toBe(2)
  })

  it('joins tags on one row instead of fanning them out', () => {
    const chart = aggregateChart({
      dimensions: [status, tags],
      values: [{ id: 'amount', name: 'Amount' }],
      emptyLabel: 'Empty',
      perRow: true,
      rows: [
        { id: 'a', cells: { status: 'open', tags: ['red', 'blue'], amount: 3 } },
        { id: 'b', cells: { status: 'done', tags: ['red'], amount: 4 } },
      ],
    })
    expect(chart.categories.map((category) => [category.label, category.color])).toEqual([
      ['Open · Red, Blue', null],
      ['Done · Red', null],
    ])
    expect(chart.series[0].values).toEqual([3, 4])
  })

  it('keeps the status color when each row is its own category', () => {
    const chart = aggregateChart({
      dimensions: [status],
      values: [{ id: 'amount', name: 'Amount' }],
      emptyLabel: 'Empty',
      perRow: true,
      rows: [
        { id: 'a', cells: { status: 'open', amount: 2 } },
        { id: 'b', cells: { status: 'open', amount: 5 } },
      ],
    })
    expect(chart.categories.map((category) => [category.label, category.color])).toEqual([
      ['Open', 'amber'],
      ['Open', 'amber'],
    ])
    expect(chart.series[0].values).toEqual([2, 5])
  })
})

describe('chart mark colors', () => {
  it('walks the Tailwind palette and repeats after the last hue', () => {
    const first = chartMarkColor({ type: 'bar', categoryIndex: 0, seriesIndex: 0 })
    const repeated = chartMarkColor({ type: 'doughnut', categoryIndex: chartCategoryPalette.length, seriesIndex: 0 })
    expect(first).toEqual({ kind: 'palette', color: chartCategoryPalette[0], comparison: false })
    expect(repeated).toEqual(first)
  })

  it('uses the app primary for a line and a comparison shade for later values', () => {
    expect(chartMarkColor({ type: 'line', categoryIndex: 3, seriesIndex: 0 })).toEqual({ kind: 'primary' })
    expect(chartMarkColor({ type: 'line', categoryIndex: 3, seriesIndex: 1 })).toEqual({ kind: 'primary-comparison' })
    expect(chartMarkColor({ type: 'line', categoryIndex: 0, seriesIndex: 2 })).toEqual({ kind: 'primary-comparison' })
  })

  it('keeps a bar comparison series on the same category hue', () => {
    const solid = chartMarkColor({ type: 'bar', categoryIndex: 2, seriesIndex: 0 })
    const comparison = chartMarkColor({ type: 'bar', categoryIndex: 2, seriesIndex: 1 })
    expect(solid).toEqual({ kind: 'palette', color: chartCategoryPalette[2], comparison: false })
    expect(comparison).toEqual({ kind: 'palette', color: chartCategoryPalette[2], comparison: true })
  })
})

describe('display state', () => {
  it('drops unknown chart columns and keeps a valid chart type', () => {
    const display = normalizeTableDisplay(
      {
        mode: 'chart',
        chart: { type: 'doughnut', dimensionIds: ['name', 'amount', 'missing'], valueIds: ['amount', 'name'], perRow: true },
        timeline: { dateColumnId: 'when', titleColumnIds: ['name'], zoom: 2 },
      },
      [
        { id: 'name', type: 'text' },
        { id: 'amount', type: 'number' },
        { id: 'total', type: 'formula' },
      ],
    )
    expect(display.mode).toBe('chart')
    expect(display.chart).toEqual({ type: 'doughnut', dimensionIds: ['name'], valueIds: ['amount'], perRow: true })
    expect(display.timeline).toEqual({ dateColumnId: 'when', titleColumnIds: ['name'], zoom: 2 })
    expect(display.kanban).toEqual(defaultTableDisplay().kanban)
  })

  it('rejects a chart type and ids that are not usable', () => {
    const display = sanitizeTableDisplay({
      mode: 'timeline',
      chart: { type: 'pie', dimensionIds: ['ok', '', 4, 'ok'], valueIds: 'amount' },
    })
    expect(display.mode).toBe('timeline')
    expect(display.chart).toEqual({ type: 'bar', dimensionIds: ['ok'], valueIds: [], perRow: false })
  })
})
