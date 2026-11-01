import { isChartDimensionType, type ChartDimensionType } from './state.js'

export const displayRowCap = 5000

export type ChartDimensionInput = {
  id: string
  type: ChartDimensionType
  entries?: { id: string; label: string; color?: string | null; position?: string }[]
}

export type ChartCategory = {
  key: string
  label: string
  color: string | null
}

export type ChartSeries = {
  columnId: string
  name: string
  values: number[]
}

export type ChartAggregate = {
  categories: ChartCategory[]
  series: ChartSeries[]
}

type Part = {
  key: string
  label: string
  color: string | null
  sort: string
  empty: boolean
}

function chartNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function emptyPart(emptyLabel: string): Part {
  return { key: '', label: emptyLabel, color: null, sort: '', empty: true }
}

function entryFor(column: ChartDimensionInput, id: string) {
  return column.entries?.find((entry) => entry.id === id)
}

function partsFor(column: ChartDimensionInput, raw: unknown, emptyLabel: string): Part[] {
  if (column.type === 'tags') {
    const ids = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
    if (ids.length === 0) return [emptyPart(emptyLabel)]
    return ids.map((id) => {
      const entry = entryFor(column, id)
      const label = entry?.label ?? id
      return { key: id, label, color: entry?.color ?? null, sort: label, empty: false }
    })
  }
  if (column.type === 'status') {
    if (typeof raw !== 'string' || raw.length === 0) return [emptyPart(emptyLabel)]
    const entry = entryFor(column, raw)
    const label = entry?.label ?? raw
    return [{ key: raw, label, color: entry?.color ?? null, sort: entry?.position ?? label, empty: false }]
  }
  if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') return [emptyPart(emptyLabel)]
  const label = String(raw).trim()
  if (!label) return [emptyPart(emptyLabel)]
  return [{ key: label, label, color: null, sort: label, empty: false }]
}

function combinations(lists: Part[][]) {
  let combos: Part[][] = [[]]
  for (const list of lists) {
    const next: Part[][] = []
    for (const combo of combos) {
      for (const part of list) next.push([...combo, part])
    }
    combos = next
  }
  return combos
}

function compareCombos(left: Part[], right: Part[]) {
  const count = Math.max(left.length, right.length)
  for (let index = 0; index < count; index += 1) {
    const a = left[index]
    const b = right[index]
    if (!a || !b) return a ? -1 : 1
    if (a.empty !== b.empty) return a.empty ? 1 : -1
    const order = a.sort.localeCompare(b.sort, undefined, { numeric: true, sensitivity: 'base' })
    if (order !== 0) return order
  }
  return 0
}

function dimensionPart(column: ChartDimensionInput, raw: unknown, emptyLabel: string): Part {
  const parts = partsFor(column, raw, emptyLabel)
  if (parts.length <= 1) return parts[0] ?? emptyPart(emptyLabel)
  return {
    key: parts.map((part) => part.key).join('\u001f'),
    label: parts.map((part) => part.label).join(', '),
    color: null,
    sort: parts[0]?.sort ?? '',
    empty: parts.every((part) => part.empty),
  }
}

export function aggregateChart(input: {
  dimensions: ChartDimensionInput[]
  values: { id: string; name: string }[]
  rows: { id?: string; cells: Record<string, unknown> }[]
  emptyLabel: string
  perRow?: boolean
}): ChartAggregate {
  const dimensions = input.dimensions.filter((column) => isChartDimensionType(column.type))
  const values = input.values.filter((column) => column.id.length > 0)
  if (dimensions.length === 0 || values.length === 0) return { categories: [], series: [] }
  const colorCategories = dimensions.length === 1 && values.length === 1 && (dimensions[0].type === 'status' || dimensions[0].type === 'tags')
  if (input.perRow) {
    const categories = input.rows.map((row, index) => {
      const parts = dimensions.map((column) => dimensionPart(column, row.cells[column.id], input.emptyLabel))
      const id = row.id && row.id.length > 0 ? row.id : `row-${index}`
      return {
        key: `${id}\u001f${index}`,
        label: parts.map((part) => part.label).join(' · '),
        color: colorCategories ? parts[0]?.color ?? null : null,
        amounts: values.map((column) => chartNumber(row.cells[column.id]) ?? 0),
      }
    })
    return {
      categories: categories.map(({ key, label, color }) => ({ key, label, color })),
      series: values.map((column, index) => ({
        columnId: column.id,
        name: column.name,
        values: categories.map((category) => category.amounts[index] ?? 0),
      })),
    }
  }
  const grouped = new Map<string, { parts: Part[]; sums: number[] }>()
  for (const row of input.rows) {
    const combos = combinations(dimensions.map((column) => partsFor(column, row.cells[column.id], input.emptyLabel)))
    for (const combo of combos) {
      const key = combo.map((part) => part.key).join('\u001f')
      let bucket = grouped.get(key)
      if (!bucket) {
        bucket = { parts: combo, sums: values.map(() => 0) }
        grouped.set(key, bucket)
      }
      values.forEach((column, index) => {
        const amount = chartNumber(row.cells[column.id])
        if (amount == null) return
        bucket.sums[index] += amount
      })
    }
  }
  const ordered = [...grouped.values()].sort((left, right) => compareCombos(left.parts, right.parts))
  return {
    categories: ordered.map((bucket) => ({
      key: bucket.parts.map((part) => part.key).join('\u001f'),
      label: bucket.parts.map((part) => part.label).join(' · '),
      color: colorCategories ? bucket.parts[0]?.color ?? null : null,
    })),
    series: values.map((column, index) => ({
      columnId: column.id,
      name: column.name,
      values: ordered.map((bucket) => bucket.sums[index]),
    })),
  }
}
