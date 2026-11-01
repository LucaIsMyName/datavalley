import type { CatalogItem, Column, RowRecord } from '@datavalley/api-client'
import { formatCell } from './cells'
import { formatSelectCellSummary } from './select-options-utils'
import { formatFormulaValue } from './formula-help'

export type NoteFieldLine = { name: string; value: string }

function catalogNames(ids: unknown, catalog: { id: string; name: string }[]): string {
  const list = Array.isArray(ids) ? ids.map(String) : typeof ids === 'string' && ids ? [ids] : []
  if (list.length === 0) return ''
  const byId = new Map(catalog.map((item) => [item.id, item.name]))
  return list.map((id) => byId.get(id) ?? id).join(', ')
}

export function formatNoteCellValue(
  column: Column,
  value: unknown,
  language: string,
  catalogs: {
    tags: CatalogItem[]
    statuses: CatalogItem[]
    members: { userId: string; username: string }[]
  },
  labels: { yes: string; no: string; mediaCount: (count: number) => string },
): string {
  if (value == null || value === '') return ''

  if (column.type === 'checkbox') {
    const on = value === true || value === 'true' || value === '1' || value === 'yes'
    return on ? labels.yes : labels.no
  }

  if (column.type === 'tags') {
    return catalogNames(value, catalogs.tags.map((t) => ({ id: t.id, name: t.name })))
  }

  if (column.type === 'status') {
    return catalogNames(value, catalogs.statuses.map((s) => ({ id: s.id, name: s.name })))
  }

  if (column.type === 'user') {
    return catalogNames(
      value,
      catalogs.members.map((m) => ({ id: m.userId, name: m.username })),
    )
  }

  if (column.type === 'select' || column.type === 'radio' || column.type === 'multi_select') {
    const multiple = column.type === 'multi_select'
    return formatSelectCellSummary(column.options, value as string | string[], multiple)
  }

  if (column.type === 'media') {
    const ids = Array.isArray(value)
      ? value
      : typeof value === 'object' && value && 'fileIds' in value
        ? (value as { fileIds: string[] }).fileIds
        : []
    return ids.length > 0 ? labels.mediaCount(ids.length) : ''
  }

  if (column.type === 'row_id') {
    return column.config.style === 'uuid' ? '' : String(value ?? '')
  }

  if (
    column.type === 'number' ||
    column.type === 'currency' ||
    column.type === 'date' ||
    column.type === 'datetime' ||
    column.type === 'formula' ||
    column.type === 'lookup'
  ) {
    return formatCell(column, value, language)
  }

  return formatFormulaValue(value)
}

export function buildNoteFieldLines(
  columns: Column[],
  row: RowRecord,
  language: string,
  catalogs: {
    tags: CatalogItem[]
    statuses: CatalogItem[]
    members: { userId: string; username: string }[]
  },
  labels: { yes: string; no: string; mediaCount: (count: number) => string; empty: string },
): NoteFieldLine[] {
  return columns.map((column) => {
    const raw =
      column.type === 'row_id'
        ? column.config.style === 'uuid'
          ? row.id
          : String(row.rowNumber ?? '')
        : row.cells[column.id]
    const value = formatNoteCellValue(column, raw, language, catalogs, labels)
    return { name: column.name, value: value || labels.empty }
  })
}
