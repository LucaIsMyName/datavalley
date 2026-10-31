import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { projects, tables } from '../../database/schema.js'
import { badRequest, conflict, notFound } from '../../errors.js'

export type TableRow = typeof tables.$inferSelect

export function assertTableDataEditable(table: TableRow) {
  if (table.mirrorOfTableId) throw conflict('Synced views are read-only')
  if (table.lockedAt) throw conflict('Table is locked')
}

export async function loadMirrorSourceMeta(db: AppDatabase, sourceTableId: string) {
  const [source] = await db.select().from(tables).where(eq(tables.id, sourceTableId)).limit(1)
  if (!source) return null
  const [project] = await db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.id, source.projectId)).limit(1)
  if (!project) return null
  return {
    tableId: source.id,
    tableName: source.name,
    projectId: project.id,
    projectName: project.name,
  }
}

export async function assertPhysicalTableEditable(db: AppDatabase, tableId: string) {
  const [table] = await db.select().from(tables).where(eq(tables.id, tableId)).limit(1)
  if (!table) throw notFound()
  assertTableDataEditable(table)
  return table
}

export async function resolvePhysicalTableId(db: AppDatabase, tableId: string) {
  const [row] = await db.select({ mirrorOfTableId: tables.mirrorOfTableId }).from(tables).where(eq(tables.id, tableId)).limit(1)
  if (!row) throw notFound()
  return row.mirrorOfTableId ?? tableId
}

export async function validateMirrorSource(db: AppDatabase, sourceTableId: string) {
  const [source] = await db.select().from(tables).where(eq(tables.id, sourceTableId)).limit(1)
  if (!source) throw notFound()
  if (source.mirrorOfTableId) throw badRequest('Cannot mirror a synced view')
  return source
}
