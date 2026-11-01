import { describe, expect, it } from 'vitest'
import { aggregateChart } from './chart.js'
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
})

describe('display state', () => {
  it('drops unknown chart columns and keeps a valid chart type', () => {
    const display = normalizeTableDisplay(
      {
        mode: 'chart',
        chart: { type: 'doughnut', dimensionIds: ['name', 'amount', 'missing'], valueIds: ['amount', 'name'] },
        timeline: { dateColumnId: 'when', titleColumnIds: ['name'], zoom: 2 },
      },
      [
        { id: 'name', type: 'text' },
        { id: 'amount', type: 'number' },
        { id: 'total', type: 'formula' },
      ],
    )
    expect(display.mode).toBe('chart')
    expect(display.chart).toEqual({ type: 'doughnut', dimensionIds: ['name'], valueIds: ['amount'] })
    expect(display.timeline).toEqual({ dateColumnId: 'when', titleColumnIds: ['name'], zoom: 2 })
    expect(display.kanban).toEqual(defaultTableDisplay().kanban)
  })

  it('rejects a chart type and ids that are not usable', () => {
    const display = sanitizeTableDisplay({
      mode: 'timeline',
      chart: { type: 'pie', dimensionIds: ['ok', '', 4, 'ok'], valueIds: 'amount' },
    })
    expect(display.mode).toBe('timeline')
    expect(display.chart).toEqual({ type: 'bar', dimensionIds: ['ok'], valueIds: [] })
  })
})
