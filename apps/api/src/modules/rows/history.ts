import { and, desc, eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { fieldHistory, tableCells, tableColumns, tableRows, tableStatuses, tableTags, users } from '../../database/schema.js'
import { readCell, type ColumnShape } from '../../column-types/index.js'
import { notFound } from '../../errors.js'
import { allows, resolveGrants } from '../../security/access.js'
import type { Subject } from '../../security/subject.js'
import { requireTable } from '../tables/service.js'

type HistoryColumn = ColumnShape & { options?: { id: string; label: string }[] }

export type FieldChange = {
  rowId: string
  columnId: string
  before: unknown
  after: unknown
}

export function historyLabel(column: HistoryColumn, value: unknown, labels: Map<string, string>) {
  if (value == null || value === '') return ''
  if (column.type === 'checkbox') {
    if (value === true || value === 'true') return 'true'
    if (value === false || value === 'false') return 'false'
    return ''
  }
  if (column.type === 'select' || column.type === 'radio' || column.type === 'multi_select') {
    const ids = Array.isArray(value) ? value : [value]
    return ids
      .map((id) => column.options?.find((option) => option.id === String(id))?.label ?? String(id))
      .filter(Boolean)
      .join(', ')
  }
  if (column.type === 'status' || column.type === 'tags' || column.type === 'user') {
    const ids = Array.isArray(value) ? value : [value]
    return ids
      .map((id) => labels.get(String(id)) ?? String(id))
      .filter(Boolean)
      .join(', ')
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

export async function previousCellValues(
  db: AppDatabase,
  columns: HistoryColumn[],
  pairs: { rowId: string; columnId: string }[],
) {
  const values = new Map<string, unknown>()
  if (pairs.length === 0) return values
  const byId = new Map(columns.map((column) => [column.id, column]))
  const cells = await db
    .select()
    .from(tableCells)
    .where(
      and(
        inArray(tableCells.rowId, [...new Set(pairs.map((pair) => pair.rowId))]),
        inArray(tableCells.columnId, [...new Set(pairs.map((pair) => pair.columnId))]),
      ),
    )
  const byKey = new Map(cells.map((cell) => [`${cell.rowId}:${cell.columnId}`, cell]))
  for (const pair of pairs) {
    const column = byId.get(pair.columnId)
    if (!column) continue
    values.set(`${pair.rowId}:${pair.columnId}`, readCell(column, byKey.get(`${pair.rowId}:${pair.columnId}`)))
  }
  return values
}

export async function recordCellHistory(
  db: AppDatabase,
  actorId: string | null,
  tableId: string,
  columns: HistoryColumn[],
  changes: FieldChange[],
) {
  const byId = new Map(columns.map((column) => [column.id, column]))
  const labels = await historyLabels(db, tableId, columns, changes)
  const rows = []
  for (const change of changes) {
    const column = byId.get(change.columnId)
    if (!column) continue
    const before = historyLabel(column, change.before, labels)
    const after = historyLabel(column, change.after, labels)
    if (before === after) continue
    rows.push({
      tableId,
      rowId: change.rowId,
      columnId: change.columnId,
      actorId,
      beforeText: before,
      afterText: after,
    })
  }
  if (rows.length === 0) return
  await db.insert(fieldHistory).values(rows)
}

const HISTORY_RAW_LIMIT = 300
const HISTORY_GROUP_LIMIT = 30
const HISTORY_BURST_MS = 5000

type HistoryEntry = {
  id: string
  columnId: string
  columnName: string
  actorId: string | null
  actorName: string | null
  before: string
  after: string
  createdAt: Date
}

export function collapseFieldHistory(entries: HistoryEntry[]) {
  const chronological = [...entries].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
  const open = new Map<string, HistoryEntry & { lastAt: number }>()
  const closed: HistoryEntry[] = []
  for (const entry of chronological) {
    const key = `${entry.columnId}:${entry.actorId ?? ''}`
    const current = open.get(key)
    if (current && entry.createdAt.getTime() - current.lastAt <= HISTORY_BURST_MS) {
      current.after = entry.after
      current.lastAt = entry.createdAt.getTime()
      current.createdAt = entry.createdAt
      current.id = entry.id
      continue
    }
    if (current) closed.push(current)
    open.set(key, { ...entry, lastAt: entry.createdAt.getTime() })
  }
  for (const current of open.values()) closed.push(current)
  return closed
    .filter((entry) => entry.before !== entry.after)
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, HISTORY_GROUP_LIMIT)
}

export async function listFieldHistory(db: AppDatabase, subject: Subject, rowId: string) {
  const [row] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
  if (!row) throw notFound()
  const table = await requireTable(db, subject, row.tableId, 'view')
  const grants = await resolveGrants(db, subject)
  if (!allows(subject, grants, 'view', { type: 'row', id: row.id, parents: { table: table.id, project: table.projectId } })) {
    throw notFound()
  }
  const entries = await db
    .select({
      id: fieldHistory.id,
      columnId: fieldHistory.columnId,
      columnName: tableColumns.name,
      actorId: fieldHistory.actorId,
      actorName: users.username,
      before: fieldHistory.beforeText,
      after: fieldHistory.afterText,
      createdAt: fieldHistory.createdAt,
    })
    .from(fieldHistory)
    .innerJoin(tableColumns, eq(tableColumns.id, fieldHistory.columnId))
    .leftJoin(users, eq(users.id, fieldHistory.actorId))
    .where(and(eq(fieldHistory.rowId, row.id), eq(fieldHistory.tableId, table.id)))
    .orderBy(desc(fieldHistory.createdAt))
    .limit(HISTORY_RAW_LIMIT)
  return collapseFieldHistory(entries).map((entry) => ({
    id: entry.id,
    columnId: entry.columnId,
    columnName: entry.columnName,
    actorName: entry.actorName,
    before: entry.before,
    after: entry.after,
    createdAt: entry.createdAt.toISOString(),
  }))
}

async function historyLabels(db: AppDatabase, tableId: string, columns: HistoryColumn[], changes: FieldChange[]) {
  const labels = new Map<string, string>()
  const ids = new Set<string>()
  const types = new Set<string>()
  for (const change of changes) {
    const column = columns.find((item) => item.id === change.columnId)
    if (!column || (column.type !== 'status' && column.type !== 'tags' && column.type !== 'user')) continue
    types.add(column.type)
    for (const value of [change.before, change.after]) {
      const list = Array.isArray(value) ? value : value ? [value] : []
      for (const id of list) if (typeof id === 'string') ids.add(id)
    }
  }
  if (ids.size === 0) return labels
  const idList = [...ids]
  if (types.has('user')) {
    const people = await db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, idList))
    for (const person of people) labels.set(person.id, person.username)
  }
  if (types.has('status')) {
    const statuses = await db
      .select({ id: tableStatuses.id, name: tableStatuses.name })
      .from(tableStatuses)
      .where(and(eq(tableStatuses.tableId, tableId), inArray(tableStatuses.id, idList)))
    for (const status of statuses) labels.set(status.id, status.name)
  }
  if (types.has('tags')) {
    const tags = await db
      .select({ id: tableTags.id, name: tableTags.name })
      .from(tableTags)
      .where(and(eq(tableTags.tableId, tableId), inArray(tableTags.id, idList)))
    for (const tag of tags) labels.set(tag.id, tag.name)
  }
  return labels
}
