import { and, eq, isNull } from 'drizzle-orm'
import { AppError } from '../../errors.js'
import type { AppDatabase } from '../../database/client.js'
import { tables } from '../../database/schema.js'
import type { Subject } from '../../security/subject.js'
import { loadColumns } from '../tables/service.js'

type StageColumn = {
  id: string
  type: string
  name: string
  options?: { id: string; label: string }[]
}

function optionId(value: unknown) {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

export async function createStageFollowUps(
  db: AppDatabase,
  subject: Subject,
  table: { id: string; name: string; projectId: string },
  columns: StageColumn[],
  changes: { rowId: string; columnId: string; before: unknown; after: unknown }[],
  create: (tableId: string, cells: Record<string, unknown>) => Promise<unknown>,
) {
  const moved = changes.flatMap((change) => {
    const column = columns.find((item) => item.id === change.columnId)
    if (!column || (column.type !== 'select' && column.type !== 'radio')) return []
    if (column.name.trim().toLowerCase() !== 'stage') return []
    const next = optionId(change.after)
    const previous = optionId(change.before)
    if (!next || next === previous) return []
    const label = column.options?.find((option) => option.id === next)?.label?.trim() || next
    return [{ rowId: change.rowId, label }]
  })
  if (moved.length === 0) return
  const projectTables = await db
    .select()
    .from(tables)
    .where(and(eq(tables.projectId, table.projectId), isNull(tables.archivedAt)))
  const tasks = projectTables.find(
    (item) => item.id !== table.id && item.name.trim().toLowerCase() === 'tasks',
  )
  if (!tasks) return
  const taskColumns = await loadColumns(db, tasks.id)
  const name = taskColumns.find(
    (column) => column.type === 'text' && column.name.trim().toLowerCase() === 'name',
  )
  if (!name) return
  const due = taskColumns.find((column) => column.type === 'date')
  const done = taskColumns.find((column) => column.type === 'checkbox')
  const deal = taskColumns.find(
    (column) => column.type === 'relation' && String(column.config.toTableId ?? '') === table.id,
  )
  const today = new Date().toISOString().slice(0, 10)
  for (const change of moved) {
    const cells: Record<string, unknown> = { [name.id]: `Follow up: ${change.label}` }
    if (due) cells[due.id] = today
    if (done) cells[done.id] = false
    if (deal) cells[deal.id] = change.rowId
    try {
      await create(tasks.id, cells)
    } catch (error) {
      if (error instanceof AppError && error.status < 500) continue
      throw error
    }
  }
}
