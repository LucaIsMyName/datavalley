import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { tableCells, tableColumns, tableRows, users } from '../../database/schema.js'
import { allows, resolveGrants } from '../../security/access.js'
import type { Subject } from '../../security/subject.js'
import { listProjects } from '../projects/service.js'
import { listTables } from '../tables/service.js'

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
  const tasks: WorkTask[] = []
  for (const table of tables) {
    const tableColumnsFor = byTable.get(table.id) ?? []
    const parents = { table: table.id, project: table.projectId }
    const canView = (columnId: string) =>
      allows(subject, grants, 'view', { type: 'column', id: columnId, parents })
    const done = pick(tableColumnsFor, ['checkbox'], DONE_NAMES, canView)
    const assignee = pick(tableColumnsFor, ['user'], ASSIGNEE_NAMES, canView)
    const due = pick(tableColumnsFor, ['date', 'datetime'], DUE_NAMES, canView)
    const titleColumn = pick(tableColumnsFor, ['text', 'mail', 'url'], TITLE_NAMES, canView)
    if (!done || !assignee || !due || !titleColumn) continue
    const dueCells = await db
      .select({ rowId: tableCells.rowId, valueText: tableCells.valueText })
      .from(tableCells)
      .where(
        and(
          eq(tableCells.columnId, due.id),
          sql`coalesce(${tableCells.valueText}, '') <> ''`,
          sql`left(${tableCells.valueText}, 10) <= ${today}`,
        ),
      )
    if (dueCells.length === 0) continue
    const dueByRow = new Map(dueCells.map((cell) => [cell.rowId, cell.valueText?.slice(0, 10) ?? '']))
    const assigned = await db
      .select({ rowId: tableCells.rowId })
      .from(tableCells)
      .where(
        and(
          eq(tableCells.columnId, assignee.id),
          inArray(tableCells.rowId, [...dueByRow.keys()]),
          sql`${tableCells.valueJsonb}->'userIds' ? ${subject.id}`,
        ),
      )
    if (assigned.length === 0) continue
    const finished = await db
      .select({ rowId: tableCells.rowId })
      .from(tableCells)
      .where(
        and(
          eq(tableCells.columnId, done.id),
          inArray(tableCells.rowId, assigned.map((cell) => cell.rowId)),
          eq(tableCells.valueBool, true),
        ),
      )
    const finishedIds = new Set(finished.map((cell) => cell.rowId))
    const openIds = assigned.map((cell) => cell.rowId).filter((rowId) => !finishedIds.has(rowId))
    if (openIds.length === 0) continue
    const titles = await db
      .select({ rowId: tableCells.rowId, valueText: tableCells.valueText })
      .from(tableCells)
      .where(and(eq(tableCells.columnId, titleColumn.id), inArray(tableCells.rowId, openIds)))
    const titleByRow = new Map(titles.map((cell) => [cell.rowId, cell.valueText?.trim() || '']))
    const visibleRows = await db
      .select({ id: tableRows.id })
      .from(tableRows)
      .where(and(eq(tableRows.tableId, table.id), inArray(tableRows.id, openIds)))
    for (const row of visibleRows) {
      if (!allows(subject, grants, 'view', { type: 'row', id: row.id, parents })) continue
      const dueDate = dueByRow.get(row.id) ?? ''
      if (!dueDate) continue
      tasks.push({
        rowId: row.id,
        title: titleByRow.get(row.id) || `#${row.id.slice(0, 8)}`,
        due: dueDate,
        overdue: dueDate < today,
        projectId: table.projectId,
        projectName: table.projectName,
        tableId: table.id,
        tableName: table.name,
        href: `/projects/${table.projectId}/tables/${table.id}/rows/${row.id}`,
      })
    }
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
