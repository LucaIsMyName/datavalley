import type { Column } from '@datavalley/api-client'
import { formatDateCellValue, isDateColumnType, selectColumnMultiple } from '@datavalley/shared'
import { formatFormulaValue } from './formula-help'
import { formatSelectCellSummary } from './select-options-utils'

const money: Record<string, string> = { USD: 'USD', EUR: 'EUR', GBP: 'GBP', CHF: 'CHF', JPY: 'JPY' }

export type CellDisplayCatalogs = {
  tags?: { id: string; name: string }[]
  statuses?: { id: string; name: string }[]
  members?: { id: string; name: string }[]
  labels?: { yes: string; no: string; mediaCount: (count: number) => string }
}

export function cellWritable(column: Column) {
  return column.type !== 'formula' && column.type !== 'lookup'
}

export function fillableColumn(column: Column) {
  return column.type !== 'lookup' && column.type !== 'row_id'
}

function catalogNames(ids: unknown, catalog: { id: string; name: string }[]) {
  const list = Array.isArray(ids) ? ids.map(String) : typeof ids === 'string' && ids ? [ids] : []
  if (list.length === 0) return ''
  const byId = new Map(catalog.map((item) => [item.id, item.name]))
  return list.map((id) => byId.get(id) ?? id).join(', ')
}

function mediaFileIds(value: unknown) {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'object' && value && 'fileIds' in value) {
    const ids = (value as { fileIds: unknown }).fileIds
    return Array.isArray(ids) ? ids.map(String) : []
  }
  return []
}

export function displayCellValue(
  column: Column,
  value: unknown,
  language: string,
  catalogs: CellDisplayCatalogs = {},
) {
  if (value == null || value === '') return ''
  if (isDateColumnType(column.type)) return formatDateCellValue(value, column, language)
  if (column.type === 'number' || column.type === 'currency') {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return String(value)
    const variant = column.type === 'currency' ? 'money' : String(column.config.variant ?? 'float')
    if (variant === 'integer') return String(Math.trunc(numeric))
    if (variant === 'money') {
      const currency = money[String(column.config.currency ?? 'USD')] ?? 'USD'
      return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(numeric)
    }
    return String(numeric)
  }
  if (column.type === 'checkbox' && catalogs.labels) {
    const on = value === true || value === 'true' || value === '1' || value === 'yes'
    return on ? catalogs.labels.yes : catalogs.labels.no
  }
  if (column.type === 'tags' && catalogs.tags) return catalogNames(value, catalogs.tags)
  if (column.type === 'status' && catalogs.statuses) return catalogNames(value, catalogs.statuses)
  if (column.type === 'user' && catalogs.members) return catalogNames(value, catalogs.members)
  if (column.type === 'select' || column.type === 'radio' || column.type === 'multi_select') {
    return formatSelectCellSummary(
      column.options ?? [],
      value as string | string[],
      selectColumnMultiple(column),
    )
  }
  if (column.type === 'media') {
    const ids = mediaFileIds(value)
    if (!catalogs.labels || ids.length === 0) return ''
    return catalogs.labels.mediaCount(ids.length)
  }
  return formatFormulaValue(value)
}

/** Clipboard text. A currency cell stays a plain number so paste can parse it. */
export function copyCellText(column: Column, value: unknown, language: string) {
  if (column.type === 'number' || column.type === 'currency') {
    if (value == null || value === '') return ''
    return String(value)
  }
  return displayCellValue(column, value, language)
}

export function relationDisplayLabel(
  value: unknown,
  relationRows: { id: string; title?: string }[],
  stored?: { rowId: string; title: string },
) {
  const id = typeof value === 'string' ? value : ''
  if (!id) return ''
  const match = relationRows.find((row) => row.id === id)
  if (match?.title) return match.title
  if (stored && stored.rowId === id && stored.title) return stored.title
  return id
}
