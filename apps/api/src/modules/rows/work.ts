import { asc, eq, inArray, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { tableCells, tableColumns, tableRows, users } from '../../database/schema.js'
import { allows, resolveGrants } from '../../security/access.js'
import type { Subject } from '../../security/subject.js'
import { listProjects } from '../projects/service.js'
import { listTables } from '../tables/service.js'
import { many } from './query.js'

const DUE_NAMES = new Set(['due', 'due date', 'deadline'])
const ASSIGNEE_NAMES = new Set(['assignee', 'owner', 'assigned'])
const DONE_NAMES = new Set(['done', 'complete', 'completed'])
const TITLE_NAMES = new Set(['name'])
const LIMIT = 50

export type WorkTask = {
  rowId: string
  title: string
  due: string
  overdue: boolean
  projectId: string
  projectName: string
  tableId: string
  tableName: string
  href: string
}

type ColumnRow = typeof tableColumns.$inferSelect

export async function listMyWork(db: AppDatabase, subject: Subject): Promise<WorkTask[]> {
  if (subject.kind !== 'user') return []
  const today = await calendarDate(db, subject.id)
  const grants = await resolveGrants(db, subject)
  const projects = await listProjects(db, subject, false)
  const tables = []
  for (const project of projects) {
    try {
      const rows = await listTables(db, subject, project.id)
      for (const table of rows) tables.push({ ...table, projectName: project.name })
    } catch {
      // A project the user can no longer open stays off the morning list.
    }
  }
  if (tables.length === 0) return []
  const columns = await db
    .select()
    .from(tableColumns)
    .where(inArray(tableColumns.tableId, tables.map((table) => table.id)))
    .orderBy(asc(tableColumns.position))
  const byTable = new Map<string, ColumnRow[]>()
  for (const column of columns) {
    const list = byTable.get(column.tableId) ?? []
    list.push(column)
    byTable.set(column.tableId, list)
  }
  const picks = tables.flatMap((table) => {
    const tableColumnsFor = byTable.get(table.id) ?? []
    const parents = { table: table.id, project: table.projectId }
    const canView = (columnId: string) =>
      allows(subject, grants, 'view', { type: 'column', id: columnId, parents })
    const done = pick(tableColumnsFor, ['checkbox'], DONE_NAMES, canView)
    const assignee = pick(tableColumnsFor, ['user'], ASSIGNEE_NAMES, canView)
    const due = pick(tableColumnsFor, ['date', 'datetime'], DUE_NAMES, canView)
    const titleColumn = pick(tableColumnsFor, ['text', 'mail', 'url'], TITLE_NAMES, canView)
    if (!done || !assignee || !due || !titleColumn) return []
    return [{ table, done: done.id, assignee: assignee.id, due: due.id, title: titleColumn.id }]
  })
  if (picks.length === 0) return []
  const candidates = sql.join(
    picks.map((item) => sql`(${item.table.id}::uuid, ${item.due}::uuid, ${item.assignee}::uuid, ${item.done}::uuid, ${item.title}::uuid)`),
    sql`, `,
  )
  const open = await many<{ rowId: string; tableId: string; due: string; title: string | null }>(
    db,
    sql`
      WITH picks (table_id, due_id, assignee_id, done_id, title_id) AS (VALUES ${candidates})
      SELECT r.id AS "rowId", r.table_id AS "tableId", left(d.value_text, 10) AS due, t.value_text AS title
      FROM picks p
      JOIN ${tableRows} r ON r.table_id = p.table_id
      JOIN ${tableCells} d ON d.row_id = r.id AND d.column_id = p.due_id
      JOIN ${tableCells} a ON a.row_id = r.id AND a.column_id = p.assignee_id
      LEFT JOIN ${tableCells} f ON f.row_id = r.id AND f.column_id = p.done_id
      LEFT JOIN ${tableCells} t ON t.row_id = r.id AND t.column_id = p.title_id
      WHERE coalesce(d.value_text, '') <> ''
        AND left(d.value_text, 10) <= ${today}
        AND a.value_jsonb->'userIds' ? ${subject.id}
        AND f.value_bool IS NOT TRUE
    `,
  )
  const tableById = new Map(picks.map((item) => [item.table.id, item.table]))
  const tasks: WorkTask[] = []
  for (const row of open) {
    const table = tableById.get(row.tableId)
    if (!table || !row.due) continue
    const parents = { table: table.id, project: table.projectId }
    if (!allows(subject, grants, 'view', { type: 'row', id: row.rowId, parents })) continue
    tasks.push({
      rowId: row.rowId,
      title: row.title?.trim() || `#${row.rowId.slice(0, 8)}`,
      due: row.due,
      overdue: row.due < today,
      projectId: table.projectId,
      projectName: table.projectName,
      tableId: table.id,
      tableName: table.name,
      href: `/projects/${table.projectId}/tables/${table.id}/rows/${row.rowId}`,
    })
  }
  return tasks
    .sort((left, right) => left.due.localeCompare(right.due) || left.title.localeCompare(right.title))
    .slice(0, LIMIT)
}

function pick(columns: ColumnRow[], types: string[], names: Set<string>, canView: (columnId: string) => boolean) {
  const matches = columns.filter((column) => types.includes(column.type) && canView(column.id))
  return matches.find((column) => names.has(column.name.trim().toLowerCase())) ?? matches[0] ?? null
}

async function calendarDate(db: AppDatabase, userId: string) {
  const [user] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId)).limit(1)
  const timeZone = user?.timezone || 'UTC'
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())
    const year = parts.find((part) => part.type === 'year')?.value
    const month = parts.find((part) => part.type === 'month')?.value
    const day = parts.find((part) => part.type === 'day')?.value
    if (year && month && day) return `${year}-${month}-${day}`
  } catch {
    // An unknown timezone falls back to the UTC calendar date.
  }
  return new Date().toISOString().slice(0, 10)
}
