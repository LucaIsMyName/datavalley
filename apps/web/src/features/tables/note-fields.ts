import type { CatalogItem, Column, RowRecord } from '@datavalley/api-client'
import { displayCellValue } from './cell-display'

export type NoteFieldLine = { name: string; value: string }

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
  if (column.type === 'row_id') {
    if (value == null || value === '') return ''
    return column.config.style === 'uuid' ? '' : String(value)
  }
  return displayCellValue(column, value, language, {
    tags: catalogs.tags,
    statuses: catalogs.statuses,
    members: catalogs.members.map((member) => ({ id: member.userId, name: member.username })),
    labels,
  })
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
