import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { duplicateKey, duplicateKind, type DuplicateKind } from '@datavalley/shared'
import type { AppDatabase } from '../../database/client.js'
import { tableCells, tableRows } from '../../database/schema.js'
import { badRequest } from '../../errors.js'
import { allows, resolveGrants } from '../../security/access.js'
import type { Subject } from '../../security/subject.js'
import { loadColumns, requireTable } from '../tables/service.js'

export type DuplicateRow = {
  rowId: string
  title: string
  href: string
}

export type DuplicateWarning = {
  columnName: string
  value: string
  rows: DuplicateRow[]
}

export async function findDuplicateRows(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  columnId: string,
  value: unknown,
  excludeRowId?: string,
) {
  const table = await requireTable(db, subject, tableId, 'view')
  const columns = await loadColumns(db, table.id)
  const column = columns.find((item) => item.id === columnId)
  if (!column) throw badRequest('Unknown column')
  const kind = duplicateKind(column)
  const key = kind ? duplicateKey(kind, value) : null
  if (!kind || !key) return []
  const grants = await resolveGrants(db, subject)
  if (!allows(subject, grants, 'view', { type: 'column', id: column.id, parents: { table: table.id, project: table.projectId } })) {
    return []
  }
  const matches = await rowsForKey(db, table.id, column.id, kind, key, excludeRowId)
  return visibleDuplicates(db, subject, grants, table, columns, matches)
}

export async function importDuplicateWarnings(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  columns: { id: string; name: string; type: string }[],
  created: { id: string; cells: Record<string, unknown> }[],
) {
  const identities = columns.flatMap((column) => {
    const kind = duplicateKind(column)
    return kind ? [{ ...column, kind }] : []
  })
  if (identities.length === 0 || created.length === 0) return []
  const table = await requireTable(db, subject, tableId, 'view')
  const loaded = await loadColumns(db, table.id)
  const grants = await resolveGrants(db, subject)
  const warnings: DuplicateWarning[] = []
  for (const column of identities) {
    const groups = new Map<string, { value: string; createdIds: string[] }>()
    for (const row of created) {
      const raw = row.cells[column.id]
      const key = duplicateKey(column.kind, raw)
      if (!key || typeof raw !== 'string') continue
      const group = groups.get(key) ?? { value: raw.trim(), createdIds: [] }
      group.createdIds.push(row.id)
      groups.set(key, group)
    }
    for (const [key, group] of groups) {
      const createdIds = new Set(group.createdIds)
      const existing = (await rowsForKey(db, table.id, column.id, column.kind, key)).filter((rowId) => !createdIds.has(rowId))
      const targets = existing.length > 0 ? existing : group.createdIds.length > 1 ? group.createdIds : []
      if (targets.length === 0) continue
      const visible = await visibleDuplicates(db, subject, grants, table, loaded, targets)
      if (visible.length === 0) continue
      warnings.push({ columnName: column.name, value: group.value, rows: visible.slice(0, 5) })
      if (warnings.length >= 20) return warnings
    }
  }
  return warnings
}

async function rowsForKey(db: AppDatabase, tableId: string, columnId: string, kind: DuplicateKind, key: string, excludeRowId?: string) {
  const matched =
    kind === 'mail'
      ? await db
          .select({ rowId: tableCells.rowId, valueText: tableCells.valueText })
          .from(tableCells)
          .where(and(eq(tableCells.tableId, tableId), eq(tableCells.columnId, columnId), sql`lower(${tableCells.valueText}) = ${key}`))
      : await db
          .select({ rowId: tableCells.rowId, valueText: tableCells.valueText })
          .from(tableCells)
          .where(
            and(
              eq(tableCells.tableId, tableId),
              eq(tableCells.columnId, columnId),
              sql`${tableCells.valueText} ILIKE ${`%${key.replace(/[\\%_]/g, (char) => `\\${char}`)}%`} ESCAPE '\\'`,
            ),
          )
  return matched
    .filter((cell) => cell.rowId !== excludeRowId && (kind === 'mail' || duplicateKey('domain', cell.valueText) === key))
    .map((cell) => cell.rowId)
}

async function visibleDuplicates(
  db: AppDatabase,
  subject: Subject,
  grants: Awaited<ReturnType<typeof resolveGrants>>,
  table: { id: string; projectId: string },
  columns: { id: string; type: string; name: string }[],
  rowIds: string[],
) {
  const unique = [...new Set(rowIds)].slice(0, 8)
  if (unique.length === 0) return []
  const parents = { table: table.id, project: table.projectId }
  const visible = unique.filter((rowId) => allows(subject, grants, 'view', { type: 'row', id: rowId, parents }))
  if (visible.length === 0) return []
  const titleColumn = columns.find((column) => column.type === 'text' && column.name.trim().toLowerCase() === 'name') ?? columns.find((column) => column.type === 'text')
  const titles = titleColumn
    ? await db
        .select({ rowId: tableCells.rowId, valueText: tableCells.valueText })
        .from(tableCells)
        .where(and(eq(tableCells.columnId, titleColumn.id), inArray(tableCells.rowId, visible)))
    : []
  const titleByRow = new Map(titles.map((cell) => [cell.rowId, cell.valueText?.trim() || '']))
  const ordered = await db
    .select({ id: tableRows.id })
    .from(tableRows)
    .where(and(eq(tableRows.tableId, table.id), inArray(tableRows.id, visible)))
    .orderBy(asc(tableRows.position))
  return ordered.map((row) => ({
    rowId: row.id,
    title: titleByRow.get(row.id) || `#${row.id.slice(0, 8)}`,
    href: `/projects/${table.projectId}/tables/${table.id}/rows/${row.id}`,
    }))
}
