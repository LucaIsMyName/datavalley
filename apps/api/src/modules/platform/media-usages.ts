import { sql } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { projects, tableCells, tableColumns, tableRows, tables } from '../../database/schema.js'
import { unauthorized } from '../../errors.js'
import type { Subject } from '../../security/subject.js'
import { requireTable } from '../tables/service.js'

export type MediaFileUsage = {
  projectId: string
  projectName: string
  tableId: string
  tableName: string
  columnId: string
  columnName: string
  rowId: string
  rowNumber: number
}

type RawUsageRow = {
  file_id: string
  project_id: string
  project_name: string
  table_id: string
  table_name: string
  column_id: string
  column_name: string
  row_id: string
  row_number: number
}

async function many<T extends Record<string, unknown>>(db: AppDatabase, query: ReturnType<typeof sql>) {
  const result = await db.execute(query)
  if (Array.isArray(result)) return result as T[]
  return ((result as { rows?: T[] }).rows ?? []) as T[]
}

function compareUsages(a: MediaFileUsage, b: MediaFileUsage) {
  const project = a.projectName.localeCompare(b.projectName)
  if (project !== 0) return project
  const table = a.tableName.localeCompare(b.tableName)
  if (table !== 0) return table
  const column = a.columnName.localeCompare(b.columnName)
  if (column !== 0) return column
  return a.rowNumber - b.rowNumber
}

export async function findMediaUsages(db: AppDatabase, subject: Subject, fileIds: string[]) {
  const empty = new Map<string, MediaFileUsage[]>()
  if (fileIds.length === 0) return empty
  if (!subject.user) throw unauthorized()

  const idList = sql.join(fileIds.map((id) => sql`${id}`), sql`, `)
  const rows = await many<RawUsageRow>(
    db,
    sql`SELECT refs.file_id AS file_id,
        p.id AS project_id,
        p.name AS project_name,
        t.id AS table_id,
        t.name AS table_name,
        col.id AS column_id,
        col.name AS column_name,
        r.id AS row_id,
        r.row_number AS row_number
      FROM ${tableCells} cell
      JOIN ${tableColumns} col ON col.id = cell.column_id AND col.type = 'media'
      JOIN ${tableRows} r ON r.id = cell.row_id
      JOIN ${tables} t ON t.id = r.table_id
      JOIN ${projects} p ON p.id = t.project_id
      CROSS JOIN LATERAL (
        SELECT elem AS file_id
        FROM jsonb_array_elements_text(
          CASE
            WHEN cell.value_jsonb ? 'fileIds' THEN cell.value_jsonb->'fileIds'
            WHEN cell.value_jsonb ? 'fileId' AND COALESCE(cell.value_jsonb->>'fileId', '') <> '' THEN jsonb_build_array(cell.value_jsonb->>'fileId')
            ELSE '[]'::jsonb
          END
        ) AS elem
      ) refs
      WHERE p.organization_id = ${subject.user.organizationId}
        AND refs.file_id IN (${idList})`,
  )

  const tableAccess = new Map<string, boolean>()
  async function canViewTable(tableId: string) {
    const cached = tableAccess.get(tableId)
    if (cached != null) return cached
    try {
      await requireTable(db, subject, tableId, 'view')
      tableAccess.set(tableId, true)
      return true
    } catch {
      tableAccess.set(tableId, false)
      return false
    }
  }

  const grouped = new Map<string, MediaFileUsage[]>()
  for (const id of fileIds) grouped.set(id, [])

  for (const row of rows) {
    if (!(await canViewTable(row.table_id))) continue
    const usage: MediaFileUsage = {
      projectId: row.project_id,
      projectName: row.project_name,
      tableId: row.table_id,
      tableName: row.table_name,
      columnId: row.column_id,
      columnName: row.column_name,
      rowId: row.row_id,
      rowNumber: Number(row.row_number),
    }
    const list = grouped.get(row.file_id) ?? []
    list.push(usage)
    grouped.set(row.file_id, list)
  }

  for (const [id, list] of grouped) {
    list.sort(compareUsages)
    grouped.set(id, list)
  }
  return grouped
}

export function usageCountFor(map: Map<string, MediaFileUsage[]>, fileId: string) {
  return map.get(fileId)?.length ?? 0
}
