import { generateKeyBetween } from 'fractional-indexing'
import { and, asc, eq, inArray, or } from 'drizzle-orm'
import type { Action } from '@datavalley/shared'
import type { AppDatabase } from '../../database/client.js'
import {
  columnOptions,
  relations,
  tableCells,
  tableColumns,
  tableRows,
  tables,
  userRecentItems,
} from '../../database/schema.js'
import { columnTypeIds, compatible, type ColumnShape } from '../../column-types/index.js'
import { badRequest, conflict, notFound } from '../../errors.js'
import { assertCan } from '../../security/access.js'
import { writeAudit } from '../../security/audit.js'
import type { Subject } from '../../security/subject.js'

export type LoadedColumn = ColumnShape & {
  description: string
  position: string
  hidden: boolean
  width: number
  frozen: boolean
}

export async function loadColumns(db: AppDatabase, tableId: string): Promise<LoadedColumn[]> {
  const columns = await db.select().from(tableColumns).where(eq(tableColumns.tableId, tableId)).orderBy(asc(tableColumns.position))
  if (columns.length === 0) return []
  const options = await db.select().from(columnOptions).where(inArray(columnOptions.columnId, columns.map((column) => column.id)))
  return columns.map((column) => ({
    id: column.id,
    name: column.name,
    type: column.type,
    config: (column.config ?? {}) as Record<string, unknown>,
    description: column.description,
    position: column.position,
    hidden: column.hidden,
    width: column.width,
    frozen: column.frozen,
    options: options
      .filter((option) => option.columnId === column.id)
      .sort((a, b) => (a.position < b.position ? -1 : 1))
      .map((option) => ({ id: option.id, label: option.label, color: option.color, position: option.position })),
  }))
}

export function presentColumn(column: LoadedColumn) {
  return {
    id: column.id,
    name: column.name,
    description: column.description,
    type: column.type,
    config: column.config,
    position: column.position,
    hidden: column.hidden,
    width: column.width,
    frozen: column.frozen,
    options: column.options ?? [],
  }
}

export function presentTable(table: typeof tables.$inferSelect) {
  return {
    id: table.id,
    projectId: table.projectId,
    name: table.name,
    description: table.description,
    headerConfig: table.headerConfig,
    footerConfig: table.footerConfig,
    archivedAt: table.archivedAt?.toISOString() ?? null,
    createdAt: table.createdAt.toISOString(),
    updatedAt: table.updatedAt.toISOString(),
  }
}

export async function requireTable(db: AppDatabase, subject: Subject, tableId: string, action: Action) {
  const [table] = await db.select().from(tables).where(eq(tables.id, tableId)).limit(1)
  if (!table) throw notFound()
  await assertCan(db, subject, action, { type: 'table', id: table.id, parents: { project: table.projectId } })
  return table
}

async function uniqueOrConflict(error: unknown): Promise<never> {
  const message = error instanceof Error ? error.message : ''
  if (message.toLowerCase().includes('unique') || message.toLowerCase().includes('duplicate')) {
    throw conflict('A record with that name already exists')
  }
  throw error
}

export async function listTables(db: AppDatabase, subject: Subject, projectId: string) {
  await assertCan(db, subject, 'view', { type: 'project', id: projectId })
  const rows = await db.select().from(tables).where(eq(tables.projectId, projectId)).orderBy(asc(tables.name))
  const visible = []
  for (const table of rows) {
    try {
      await assertCan(db, subject, 'view', { type: 'table', id: table.id, parents: { project: projectId } })
      if (!table.archivedAt) visible.push(presentTable(table))
    } catch {
      // Hidden tables stay out of the list.
    }
  }
  return visible
}

export async function createTable(db: AppDatabase, subject: Subject, projectId: string, input: { name: string; description?: string }) {
  await assertCan(db, subject, 'manage_structure', { type: 'project', id: projectId })
  try {
    const [table] = await db
      .insert(tables)
      .values({ projectId, name: input.name.trim(), description: input.description ?? '', createdBy: subject.id })
      .returning()
    await writeAudit(db, subject, { action: 'table.create', resourceType: 'table', resourceId: table.id })
    return presentTable(table)
  } catch (error) {
    return uniqueOrConflict(error)
  }
}

export async function getTable(db: AppDatabase, subject: Subject, tableId: string) {
  const table = await requireTable(db, subject, tableId, 'view')
  if (subject.kind === 'user') {
    await db
      .insert(userRecentItems)
      .values({ userId: subject.id, resourceType: 'table', resourceId: table.id, openedAt: new Date() })
      .onConflictDoUpdate({
        target: [userRecentItems.userId, userRecentItems.resourceType, userRecentItems.resourceId],
        set: { openedAt: new Date() },
      })
  }
  return { ...presentTable(table), columns: (await loadColumns(db, table.id)).map(presentColumn) }
}

export async function updateTable(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  input: { name?: string; description?: string; headerConfig?: unknown; footerConfig?: unknown },
) {
  await requireTable(db, subject, tableId, 'manage_structure')
  try {
    const [table] = await db
      .update(tables)
      .set({
        name: input.name?.trim(),
        description: input.description,
        headerConfig: input.headerConfig as never,
        footerConfig: input.footerConfig as never,
        updatedAt: new Date(),
      })
      .where(eq(tables.id, tableId))
      .returning()
    return presentTable(table)
  } catch (error) {
    return uniqueOrConflict(error)
  }
}

export async function setTableArchived(db: AppDatabase, subject: Subject, tableId: string, archived: boolean) {
  await requireTable(db, subject, tableId, 'delete')
  const [table] = await db
    .update(tables)
    .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
    .where(eq(tables.id, tableId))
    .returning()
  return presentTable(table)
}

export async function deleteTable(db: AppDatabase, subject: Subject, tableId: string) {
  await requireTable(db, subject, tableId, 'delete')
  await db.delete(tables).where(eq(tables.id, tableId))
  await writeAudit(db, subject, { action: 'table.delete', resourceType: 'table', resourceId: tableId })
}

export async function addColumn(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  input: { name: string; type: string; description?: string; config?: Record<string, unknown>; options?: { label: string; color?: string }[] },
) {
  await requireTable(db, subject, tableId, 'manage_structure')
  if (!columnTypeIds.includes(input.type as never)) throw badRequest('Unknown column type')
  const existing = await loadColumns(db, tableId)
  const position = generateKeyBetween(existing.at(-1)?.position ?? null, null)
  try {
    const [column] = await db
      .insert(tableColumns)
      .values({
        tableId,
        name: input.name.trim(),
        description: input.description ?? '',
        type: input.type,
        config: input.config ?? {},
        position,
      })
      .returning()
    let optionPos: string | null = null
    for (const option of input.options ?? []) {
      optionPos = generateKeyBetween(optionPos, null)
      await db.insert(columnOptions).values({ columnId: column.id, label: option.label, color: option.color ?? null, position: optionPos })
    }
    await writeAudit(db, subject, { action: 'column.create', resourceType: 'column', resourceId: column.id, metadata: { tableId, type: input.type } })
    return presentColumn((await loadColumns(db, tableId)).find((item) => item.id === column.id)!)
  } catch (error) {
    return uniqueOrConflict(error)
  }
}

export async function updateColumn(
  db: AppDatabase,
  subject: Subject,
  columnId: string,
  input: { name?: string; description?: string; hidden?: boolean; width?: number; frozen?: boolean; config?: Record<string, unknown> },
) {
  const [column] = await db.select().from(tableColumns).where(eq(tableColumns.id, columnId)).limit(1)
  if (!column) throw notFound()
  await requireTable(db, subject, column.tableId, 'manage_structure')
  const [updated] = await db
    .update(tableColumns)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(tableColumns.id, columnId))
    .returning()
  await writeAudit(db, subject, { action: 'column.update', resourceType: 'column', resourceId: columnId })
  return presentColumn((await loadColumns(db, updated.tableId)).find((item) => item.id === columnId)!)
}

export async function deleteColumn(db: AppDatabase, subject: Subject, columnId: string) {
  const [column] = await db.select().from(tableColumns).where(eq(tableColumns.id, columnId)).limit(1)
  if (!column) throw notFound()
  await requireTable(db, subject, column.tableId, 'manage_structure')
  await db.delete(tableColumns).where(eq(tableColumns.id, columnId))
  await writeAudit(db, subject, { action: 'column.delete', resourceType: 'column', resourceId: columnId })
}

export async function reorderColumns(db: AppDatabase, subject: Subject, tableId: string, columnIds: string[]) {
  await requireTable(db, subject, tableId, 'manage_structure')
  let previous: string | null = null
  for (const columnId of columnIds) {
    previous = generateKeyBetween(previous, null)
    await db.update(tableColumns).set({ position: previous, updatedAt: new Date() }).where(and(eq(tableColumns.id, columnId), eq(tableColumns.tableId, tableId)))
  }
}

export async function convertColumn(db: AppDatabase, subject: Subject, columnId: string, type: string) {
  const [column] = await db.select().from(tableColumns).where(eq(tableColumns.id, columnId)).limit(1)
  if (!column) throw notFound()
  await requireTable(db, subject, column.tableId, 'manage_structure')
  if (!columnTypeIds.includes(type as never)) throw badRequest('Unknown column type')
  const cells = await db.select({ id: tableCells.id }).from(tableCells).where(eq(tableCells.columnId, columnId))
  let cleared = 0
  if (!compatible(column.type, type) && cells.length) {
    cleared = cells.length
    await db.delete(tableCells).where(eq(tableCells.columnId, columnId))
  }
  await db.update(tableColumns).set({ type, updatedAt: new Date() }).where(eq(tableColumns.id, columnId))
  await writeAudit(db, subject, { action: 'column.convert', resourceType: 'column', resourceId: columnId, metadata: { from: column.type, to: type, cleared } })
  return { cleared }
}

export async function duplicateTable(db: AppDatabase, subject: Subject, tableId: string, includeData: boolean) {
  const table = await requireTable(db, subject, tableId, 'view')
  await assertCan(db, subject, 'manage_structure', { type: 'project', id: table.projectId })
  const columns = await loadColumns(db, tableId)
  const [copy] = await db
    .insert(tables)
    .values({
      projectId: table.projectId,
      name: `${table.name} copy`,
      description: table.description,
      headerConfig: table.headerConfig,
      footerConfig: table.footerConfig,
      createdBy: subject.id,
    })
    .returning()
  const columnMap = new Map<string, string>()
  for (const column of columns) {
    const [created] = await db
      .insert(tableColumns)
      .values({
        tableId: copy.id,
        name: column.name,
        description: column.description,
        type: column.type,
        config: column.config,
        position: column.position,
        hidden: column.hidden,
        width: column.width,
        frozen: column.frozen,
      })
      .returning()
    columnMap.set(column.id, created.id)
    for (const option of column.options ?? []) {
      await db.insert(columnOptions).values({ columnId: created.id, label: option.label, color: option.color, position: option.position })
    }
  }
  if (includeData) {
    const rows = await db.select().from(tableRows).where(eq(tableRows.tableId, tableId))
    for (const row of rows) {
      const [created] = await db.insert(tableRows).values({ tableId: copy.id, position: row.position, createdBy: subject.id }).returning()
      const cells = await db.select().from(tableCells).where(eq(tableCells.rowId, row.id))
      if (cells.length) {
        await db.insert(tableCells).values(
          cells.map((cell) => ({
            tableId: copy.id,
            rowId: created.id,
            columnId: columnMap.get(cell.columnId) ?? cell.columnId,
            valueText: cell.valueText,
            valueNumber: cell.valueNumber,
            valueBool: cell.valueBool,
            valueTimestamptz: cell.valueTimestamptz,
            valueJsonb: cell.valueJsonb,
          })),
        )
      }
    }
  }
  return presentTable(copy)
}

export async function moveTable(db: AppDatabase, subject: Subject, tableId: string, projectId: string) {
  const table = await requireTable(db, subject, tableId, 'delete')
  await assertCan(db, subject, 'manage_structure', { type: 'project', id: projectId })
  const links = await db
    .select()
    .from(relations)
    .where(or(eq(relations.fromTableId, tableId), eq(relations.toTableId, tableId)))
  for (const link of links) {
    const otherId = link.fromTableId === tableId ? link.toTableId : link.fromTableId
    const [other] = await db.select().from(tables).where(eq(tables.id, otherId)).limit(1)
    if (other && other.projectId !== projectId) throw conflict('This table has a relationship in another project')
  }
  const [updated] = await db.update(tables).set({ projectId, updatedAt: new Date() }).where(eq(tables.id, table.id)).returning()
  await writeAudit(db, subject, { action: 'table.move', resourceType: 'table', resourceId: tableId, metadata: { from: table.projectId, to: projectId } })
  return presentTable(updated)
}
