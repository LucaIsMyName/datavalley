import { generateKeyBetween } from 'fractional-indexing'
import { and, asc, eq, inArray, or } from 'drizzle-orm'
import { csvTable, isResourceIcon, normalizeCsvDelimiter, type Action } from '@datavalley/shared'
import type { AppDatabase } from '../../database/client.js'
import {
  columnOptions,
  relations,
  tableCells,
  tableColumns,
  tableRows,
  tableStatuses,
  tableTags,
  tables,
  userRecentItems,
  userTableState,
} from '../../database/schema.js'
import { columnTypeIds, defaultColumnIcon, nextTagColor, parseCell, readCell, type CellWrite, type ColumnShape } from '../../column-types/index.js'
import { badRequest, conflict, notFound } from '../../errors.js'
import { assertCan } from '../../security/access.js'
import { writeAudit } from '../../security/audit.js'
import type { Subject } from '../../security/subject.js'
import { assertTableDataEditable, loadMirrorSourceMeta, validateMirrorSource } from './resolve.js'
import { seedDemoTable } from './template.js'

export type LoadedColumn = ColumnShape & {
  tableId: string
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
    tableId: column.tableId,
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
    icon: table.icon,
    position: table.position,
    headerConfig: table.headerConfig,
    footerConfig: table.footerConfig,
    formatRules: table.formatRules ?? [],
    archivedAt: table.archivedAt?.toISOString() ?? null,
    lockedAt: table.lockedAt?.toISOString() ?? null,
    mirrorOfTableId: table.mirrorOfTableId,
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

export async function resolveTableContext(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  action: Action = 'view',
) {
  const shell = await requireTable(db, subject, tableId, action)
  if (!shell.mirrorOfTableId) {
    return { shell, physical: shell, isMirror: false as const }
  }
  const physical = await requireTable(db, subject, shell.mirrorOfTableId, 'view')
  return { shell, physical, isMirror: true as const }
}

export async function requireEditableTable(db: AppDatabase, subject: Subject, tableId: string, action: Action) {
  const table = await requireTable(db, subject, tableId, action)
  assertTableDataEditable(table)
  return table
}

export async function lockTable(db: AppDatabase, subject: Subject, tableId: string) {
  const table = await requireTable(db, subject, tableId, 'edit')
  if (table.mirrorOfTableId) throw badRequest('Synced views cannot be locked')
  if (table.lockedAt) return presentTable(table)
  const [updated] = await db
    .update(tables)
    .set({ lockedAt: new Date(), updatedAt: new Date() })
    .where(eq(tables.id, tableId))
    .returning()
  await writeAudit(db, subject, { action: 'table.lock', resourceType: 'table', resourceId: tableId })
  return presentTable(updated)
}

export async function unlockTable(db: AppDatabase, subject: Subject, tableId: string) {
  const table = await requireTable(db, subject, tableId, 'edit')
  if (!table.lockedAt) return presentTable(table)
  const [updated] = await db
    .update(tables)
    .set({ lockedAt: null, updatedAt: new Date() })
    .where(eq(tables.id, tableId))
    .returning()
  await writeAudit(db, subject, { action: 'table.unlock', resourceType: 'table', resourceId: tableId })
  return presentTable(updated)
}

export async function createTableMirror(
  db: AppDatabase,
  subject: Subject,
  hostProjectId: string,
  input: { sourceTableId: string; name?: string },
) {
  await assertCan(db, subject, 'manage_structure', { type: 'project', id: hostProjectId })
  const source = await validateMirrorSource(db, input.sourceTableId)
  await requireTable(db, subject, source.id, 'view')
  const requested = input.name?.trim() ?? ''
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const name = requested || `${source.name} (view)`
    try {
      const position = await nextTablePosition(db, hostProjectId)
      const [table] = await db
        .insert(tables)
        .values({
          projectId: hostProjectId,
          name,
          description: '',
          position,
          mirrorOfTableId: source.id,
          createdBy: subject.id,
        })
        .returning()
      await writeAudit(db, subject, { action: 'table.mirror', resourceType: 'table', resourceId: table.id, metadata: { sourceTableId: source.id } })
      return presentTable(table)
    } catch (error) {
      if (requested || attempt === 4) return uniqueOrConflict(error)
    }
  }
  throw conflict('A record with that name already exists')
}

export function positionBetween(items: { id: string; position: string }[], beforeId?: string | null, afterId?: string | null) {
  if (beforeId && afterId) throw badRequest('Choose one neighbor')
  if (beforeId) {
    const index = items.findIndex((item) => item.id === beforeId)
    if (index < 0) throw badRequest('Unknown neighbor')
    return generateKeyBetween(index === 0 ? null : items[index - 1].position, items[index].position)
  }
  if (afterId) {
    const index = items.findIndex((item) => item.id === afterId)
    if (index < 0) throw badRequest('Unknown neighbor')
    return generateKeyBetween(items[index].position, index === items.length - 1 ? null : items[index + 1].position)
  }
  return generateKeyBetween(items.at(-1)?.position ?? null, null)
}

async function nextTableName(db: AppDatabase, projectId: string) {
  const existing = await db.select({ name: tables.name }).from(tables).where(eq(tables.projectId, projectId))
  const taken = new Set(existing.map((row) => row.name))
  if (!taken.has('Untitled')) return 'Untitled'
  let index = 2
  while (taken.has(`Untitled ${index}`)) index += 1
  return `Untitled ${index}`
}

function copyName(taken: Set<string>, source: string) {
  const base = `${source} copy`
  if (!taken.has(base)) return base
  let index = 2
  while (taken.has(`${base} ${index}`)) index += 1
  return `${base} ${index}`
}

async function uniqueOrConflict(error: unknown): Promise<never> {
  const message = error instanceof Error ? error.message : ''
  if (message.toLowerCase().includes('unique') || message.toLowerCase().includes('duplicate')) {
    throw conflict('A record with that name already exists')
  }
  throw error
}

export async function nextTablePosition(db: AppDatabase, projectId: string) {
  const existing = await db
    .select({ id: tables.id, position: tables.position })
    .from(tables)
    .where(eq(tables.projectId, projectId))
    .orderBy(asc(tables.position))
  return positionBetween(existing)
}

export async function listTables(db: AppDatabase, subject: Subject, projectId: string) {
  await assertCan(db, subject, 'view', { type: 'project', id: projectId })
  const rows = await db.select().from(tables).where(eq(tables.projectId, projectId)).orderBy(asc(tables.position), asc(tables.name))
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

export async function createTable(
  db: AppDatabase,
  subject: Subject,
  projectId: string,
  input: { name?: string; description?: string; template?: 'demo' },
) {
  await assertCan(db, subject, 'manage_structure', { type: 'project', id: projectId })
  const requested = input.name?.trim() ?? ''
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const name = requested || (await nextTableName(db, projectId))
    try {
      const position = await nextTablePosition(db, projectId)
      const [table] = await db
        .insert(tables)
        .values({ projectId, name, description: input.description ?? '', position, createdBy: subject.id })
        .returning()
      if (input.template === 'demo') await seedDemoTable(db, table.id, subject.id)
      await writeAudit(db, subject, { action: 'table.create', resourceType: 'table', resourceId: table.id })
      return presentTable(table)
    } catch (error) {
      if (requested || attempt === 4) return uniqueOrConflict(error)
    }
  }
  throw conflict('A record with that name already exists')
}

export async function reorderTables(db: AppDatabase, subject: Subject, projectId: string, tableIds: string[]) {
  await assertCan(db, subject, 'manage_structure', { type: 'project', id: projectId })
  const existing = await db.select({ id: tables.id }).from(tables).where(eq(tables.projectId, projectId))
  const allowed = new Set(existing.map((table) => table.id))
  if (tableIds.length === 0 || tableIds.some((id) => !allowed.has(id))) throw badRequest('Unknown table')
  let previous: string | null = null
  for (const tableId of tableIds) {
    previous = generateKeyBetween(previous, null)
    await db.update(tables).set({ position: previous, updatedAt: new Date() }).where(and(eq(tables.id, tableId), eq(tables.projectId, projectId)))
  }
}

export async function ensureTextColumns(db: AppDatabase, tableId: string, names: string[]) {
  const existing = await loadColumns(db, tableId)
  const byName = new Map(existing.map((column) => [column.name.toLowerCase(), column]))
  let lastPos = existing.map((column) => column.position).sort().at(-1) ?? null
  const mapped: LoadedColumn[] = []
  for (const name of names) {
    const found = byName.get(name.toLowerCase())
    if (found) {
      mapped.push(found)
      continue
    }
    lastPos = generateKeyBetween(lastPos, null)
    const [column] = await db
      .insert(tableColumns)
      .values({
        tableId,
        name,
        type: 'text',
        config: { icon: defaultColumnIcon('text') },
        position: lastPos,
      })
      .returning()
    const loaded: LoadedColumn = {
      id: column.id,
      tableId: column.tableId,
      name: column.name,
      type: column.type,
      config: (column.config ?? {}) as Record<string, unknown>,
      description: column.description,
      position: column.position,
      hidden: column.hidden,
      width: column.width,
      frozen: column.frozen,
      options: [],
    }
    byName.set(column.name.toLowerCase(), loaded)
    mapped.push(loaded)
  }
  return mapped
}

export async function createTableFromCsv(
  db: AppDatabase,
  subject: Subject,
  projectId: string,
  input: { name?: string; csv: string; headerRow: boolean; delimiter?: string },
) {
  await assertCan(db, subject, 'manage_structure', { type: 'project', id: projectId })
  let delimiter = ','
  try {
    delimiter = normalizeCsvDelimiter(input.delimiter)
  } catch {
    throw badRequest('CSV delimiter must be a single character')
  }
  const parsed = csvTable(input.csv, input.headerRow, delimiter)
  if (parsed.names.length === 0) throw badRequest('CSV is empty')
  const requested = input.name?.trim() ?? ''
  const name = requested || (await nextTableName(db, projectId))
  try {
    return await db.transaction(async (tx) => {
      const position = await nextTablePosition(tx as unknown as AppDatabase, projectId)
      const [table] = await tx
        .insert(tables)
        .values({ projectId, name, description: '', position, createdBy: subject.id })
        .returning()
      const columns = await ensureTextColumns(tx as unknown as AppDatabase, table.id, parsed.names)
      let rowPos: string | null = null
      let rowNumber = 1
      for (const record of parsed.records) {
        rowPos = generateKeyBetween(rowPos, null)
        const [row] = await tx
          .insert(tableRows)
          .values({ tableId: table.id, position: rowPos, rowNumber, createdBy: subject.id })
          .returning()
        const cells = columns
          .map((column, index) => ({
            tableId: table.id,
            rowId: row.id,
            columnId: column.id,
            valueText: record[index] ?? '',
          }))
          .filter((cell) => cell.valueText !== '')
        if (cells.length > 0) await tx.insert(tableCells).values(cells)
        rowNumber += 1
      }
      await tx.update(tables).set({ nextRowNumber: rowNumber }).where(eq(tables.id, table.id))
      await writeAudit(tx as unknown as AppDatabase, subject, { action: 'table.create', resourceType: 'table', resourceId: table.id })
      return presentTable(table)
    })
  } catch (error) {
    return uniqueOrConflict(error)
  }
}

export async function getTable(db: AppDatabase, subject: Subject, tableId: string) {
  const { shell, physical, isMirror } = await resolveTableContext(db, subject, tableId, 'view')
  if (subject.kind === 'user') {
    await db
      .insert(userRecentItems)
      .values({ userId: subject.id, resourceType: 'table', resourceId: shell.id, openedAt: new Date() })
      .onConflictDoUpdate({
        target: [userRecentItems.userId, userRecentItems.resourceType, userRecentItems.resourceId],
        set: { openedAt: new Date() },
      })
  }
  const tags = await db.select().from(tableTags).where(eq(tableTags.tableId, physical.id)).orderBy(asc(tableTags.name))
  const statuses = await db.select().from(tableStatuses).where(eq(tableStatuses.tableId, physical.id)).orderBy(asc(tableStatuses.position))
  const mirrorSource = isMirror ? await loadMirrorSourceMeta(db, physical.id) : null
  return {
    ...presentTable(shell),
    mirrorSource,
    columns: (await loadColumns(db, physical.id)).map((column) => presentColumn(column)),
    tags,
    statuses,
  }
}

export async function updateTable(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  input: { name?: string; description?: string; icon?: string; headerConfig?: unknown; footerConfig?: unknown; formatRules?: unknown },
) {
  const table = await requireTable(db, subject, tableId, 'manage_structure')
  const restricted = Boolean(table.mirrorOfTableId) || Boolean(table.lockedAt)
  if (restricted && (input.headerConfig !== undefined || input.footerConfig !== undefined || input.formatRules !== undefined)) {
    throw conflict(table.mirrorOfTableId ? 'Synced views are read-only' : 'Table is locked')
  }
  if (input.icon !== undefined && !isResourceIcon(input.icon)) throw badRequest('Unknown icon')
  try {
    const [updated] = await db
      .update(tables)
      .set({
        name: input.name?.trim(),
        description: input.description,
        icon: input.icon,
        headerConfig: restricted ? undefined : (input.headerConfig as never),
        footerConfig: restricted ? undefined : (input.footerConfig as never),
        formatRules: restricted ? undefined : (input.formatRules as never),
        updatedAt: new Date(),
      })
      .where(eq(tables.id, tableId))
      .returning()
    return presentTable(updated)
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
  const table = await requireTable(db, subject, tableId, 'delete')
  if (table.lockedAt) throw conflict('Unlock the table before deleting')
  await db.delete(tables).where(eq(tables.id, tableId))
  await writeAudit(db, subject, { action: 'table.delete', resourceType: 'table', resourceId: tableId })
}

export async function addColumn(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  input: {
    name: string
    type: string
    description?: string
    config?: Record<string, unknown>
    options?: { label: string; color?: string }[]
    beforeId?: string
    afterId?: string
  },
) {
  await requireEditableTable(db, subject, tableId, 'manage_structure')
  if (!columnTypeIds.includes(input.type as never)) throw badRequest('Unknown column type')
  const existing = await loadColumns(db, tableId)
  const position = positionBetween(existing, input.beforeId, input.afterId)
  try {
    const [column] = await db
      .insert(tableColumns)
      .values({
        tableId,
        name: input.name.trim(),
        description: input.description ?? '',
        type: input.type,
        config: {
          icon: defaultColumnIcon(input.type),
          ...(input.type === 'row_id' ? { style: 'sequence' } : {}),
          ...(input.config ?? {}),
        },
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
  await requireEditableTable(db, subject, column.tableId, 'manage_structure')
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
  await requireEditableTable(db, subject, column.tableId, 'manage_structure')
  await db.delete(tableColumns).where(eq(tableColumns.id, columnId))
  await writeAudit(db, subject, { action: 'column.delete', resourceType: 'column', resourceId: columnId })
}

export async function duplicateColumns(db: AppDatabase, subject: Subject, tableId: string, columnIds: string[]) {
  await requireEditableTable(db, subject, tableId, 'manage_structure')
  const columns = await loadColumns(db, tableId)
  const selected = columns.filter((column) => columnIds.includes(column.id))
  const created = []
  for (const source of [...selected].reverse()) {
    const taken = new Set((await loadColumns(db, tableId)).map((column) => column.name))
    const copy = await addColumn(db, subject, tableId, {
      name: copyName(taken, source.name),
      type: source.type,
      description: source.description,
      config: source.config,
      options: (source.options ?? []).map((option) => ({ label: option.label, color: option.color ?? undefined })),
      afterId: source.id,
    })
    await updateColumn(db, subject, copy.id, { hidden: source.hidden, width: source.width, frozen: source.frozen })
    const cells = await db.select().from(tableCells).where(eq(tableCells.columnId, source.id))
    if (cells.length) {
      await db.insert(tableCells).values(
        cells.map((cell) => ({
          tableId,
          rowId: cell.rowId,
          columnId: copy.id,
          valueText: cell.valueText,
          valueNumber: cell.valueNumber,
          valueBool: cell.valueBool,
          valueTimestamptz: cell.valueTimestamptz,
          valueJsonb: cell.valueJsonb,
          background: cell.background,
        })),
      )
    }
    created.unshift(copy)
  }
  return created
}

export async function reorderColumns(db: AppDatabase, subject: Subject, tableId: string, columnIds: string[]) {
  await requireEditableTable(db, subject, tableId, 'manage_structure')
  let previous: string | null = null
  for (const columnId of columnIds) {
    previous = generateKeyBetween(previous, null)
    await db.update(tableColumns).set({ position: previous, updatedAt: new Date() }).where(and(eq(tableColumns.id, columnId), eq(tableColumns.tableId, tableId)))
  }
}

const structuralTypes = new Set(['formula', 'lookup', 'media', 'relation'])

function storedValue(parsed: CellWrite) {
  return {
    valueText: parsed.valueText,
    valueNumber: parsed.valueNumber,
    valueBool: parsed.valueBool,
    valueTimestamptz: parsed.valueTimestamptz,
    valueJsonb: parsed.valueJsonb as never,
  }
}

export async function convertColumn(db: AppDatabase, subject: Subject, columnId: string, type: string, dryRun = false) {
  const [column] = await db.select().from(tableColumns).where(eq(tableColumns.id, columnId)).limit(1)
  if (!column) throw notFound()
  await requireEditableTable(db, subject, column.tableId, 'manage_structure')
  if (!columnTypeIds.includes(type as never)) throw badRequest('Unknown column type')
  const loaded = (await loadColumns(db, column.tableId)).find((item) => item.id === columnId)
  if (!loaded) throw notFound()
  const cells = await db.select().from(tableCells).where(eq(tableCells.columnId, columnId))
  const target: ColumnShape = { ...loaded, type }
  const clearIds: string[] = []
  const rewrites: { id: string; parsed: CellWrite }[] = []
  const wipe = structuralTypes.has(type) && column.type !== type
  for (const cell of cells) {
    const current = readCell(loaded, cell)
    if (current == null || current === '') continue
    if (wipe) {
      clearIds.push(cell.id)
      continue
    }
    try {
      const parsed = parseCell(target, current)
      if (!parsed) {
        clearIds.push(cell.id)
        continue
      }
      rewrites.push({ id: cell.id, parsed })
    } catch {
      clearIds.push(cell.id)
    }
  }
  const cleared = clearIds.length
  const kept = cells.length - cleared
  if (dryRun || column.type === type) return { cleared: column.type === type ? 0 : cleared, kept: column.type === type ? cells.length : kept }
  if (clearIds.length) await db.delete(tableCells).where(inArray(tableCells.id, clearIds))
  for (const rewrite of rewrites) {
    await db.update(tableCells).set({ ...storedValue(rewrite.parsed), updatedAt: new Date() }).where(eq(tableCells.id, rewrite.id))
  }
  await db.update(tableColumns).set({ type, updatedAt: new Date() }).where(eq(tableColumns.id, columnId))
  await writeAudit(db, subject, { action: 'column.convert', resourceType: 'column', resourceId: columnId, metadata: { from: column.type, to: type, cleared } })
  return { cleared, kept }
}

export async function attachRelation(
  db: AppDatabase,
  subject: Subject,
  columnId: string,
  input: { toTableId: string; cardinality: string },
) {
  const [column] = await db.select().from(tableColumns).where(eq(tableColumns.id, columnId)).limit(1)
  if (!column) throw notFound()
  const table = await requireEditableTable(db, subject, column.tableId, 'manage_structure')
  await assertCan(db, subject, 'view', { type: 'table', id: input.toTableId, parents: { project: table.projectId } })
  await convertColumn(db, subject, columnId, 'relation')
  const [relation] = await db
    .insert(relations)
    .values({
      fromTableId: column.tableId,
      toTableId: input.toTableId,
      fromColumnId: column.id,
      cardinality: input.cardinality,
      onDelete: 'restrict',
    })
    .returning()
  return updateColumn(db, subject, column.id, { config: { relationId: relation.id, toTableId: input.toTableId } })
}

export async function duplicateTable(db: AppDatabase, subject: Subject, tableId: string, includeData: boolean) {
  const { shell, physical } = await resolveTableContext(db, subject, tableId, 'view')
  assertTableDataEditable(shell)
  const table = physical
  await assertCan(db, subject, 'manage_structure', { type: 'project', id: shell.projectId })
  const columns = await loadColumns(db, table.id)
  const [copy] = await db
    .insert(tables)
    .values({
      projectId: shell.projectId,
      name: `${shell.name} copy`,
      description: table.description,
      icon: table.icon,
      position: await nextTablePosition(db, table.projectId),
      headerConfig: table.headerConfig,
      footerConfig: table.footerConfig,
      formatRules: table.formatRules,
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
  await db.update(tables).set({ nextRowNumber: table.nextRowNumber, formatRules: remapIds(table.formatRules, columnMap) as never }).where(eq(tables.id, copy.id))
  const tagMap = new Map<string, string>()
  for (const tag of await db.select().from(tableTags).where(eq(tableTags.tableId, table.id))) {
    const [created] = await db.insert(tableTags).values({ tableId: copy.id, name: tag.name, color: tag.color }).returning()
    tagMap.set(tag.id, created.id)
  }
  const statusMap = new Map<string, string>()
  for (const status of await db.select().from(tableStatuses).where(eq(tableStatuses.tableId, table.id))) {
    const [created] = await db.insert(tableStatuses).values({ tableId: copy.id, name: status.name, color: status.color, position: status.position }).returning()
    statusMap.set(status.id, created.id)
  }
  if (includeData) {
    const rows = await db.select().from(tableRows).where(eq(tableRows.tableId, table.id))
    for (const row of rows) {
      const [created] = await db.insert(tableRows).values({ tableId: copy.id, position: row.position, color: row.color, notes: row.notes, rowNumber: row.rowNumber, createdBy: subject.id }).returning()
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
            valueJsonb: remapCatalog(cell.valueJsonb, tagMap, statusMap),
            background: cell.background,
            formatRules: remapIds(cell.formatRules, columnMap) as never,
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
  const [updated] = await db
    .update(tables)
    .set({ projectId, position: await nextTablePosition(db, projectId), updatedAt: new Date() })
    .where(eq(tables.id, table.id))
    .returning()
  await writeAudit(db, subject, { action: 'table.move', resourceType: 'table', resourceId: tableId, metadata: { from: table.projectId, to: projectId } })
  return presentTable(updated)
}

function remapIds(value: unknown, ids: Map<string, string>) {
  let text = JSON.stringify(value ?? [])
  for (const [from, to] of ids) text = text.replaceAll(from, to)
  return JSON.parse(text) as unknown
}

function remapCatalog(value: unknown, tags: Map<string, string>, statuses: Map<string, string>) {
  if (!value || typeof value !== 'object') return value
  const record = value as { tagIds?: string[]; statusId?: string; userIds?: string[] }
  if (Array.isArray(record.tagIds)) return { ...record, tagIds: record.tagIds.map((id) => tags.get(id) ?? id) }
  if (typeof record.statusId === 'string') return { ...record, statusId: statuses.get(record.statusId) ?? record.statusId }
  return value
}

export async function createTag(db: AppDatabase, subject: Subject, tableId: string, name: string) {
  await requireEditableTable(db, subject, tableId, 'edit')
  const trimmed = name.trim()
  if (!trimmed) throw badRequest('Tag name is required')
  const existing = await db.select().from(tableTags).where(eq(tableTags.tableId, tableId))
  const match = existing.find((tag) => tag.name.toLowerCase() === trimmed.toLowerCase())
  if (match) return match
  const [tag] = await db.insert(tableTags).values({ tableId, name: trimmed, color: nextTagColor(existing.length) }).returning()
  return tag
}

export async function updateTag(db: AppDatabase, subject: Subject, tableId: string, tagId: string, input: { color?: string; name?: string }) {
  await requireEditableTable(db, subject, tableId, 'edit')
  const patch: { color?: string; name?: string } = {}
  if (typeof input.color === 'string' && input.color.trim()) patch.color = input.color.trim()
  if (input.name != null) {
    const trimmed = input.name.trim()
    if (!trimmed) throw badRequest('Tag name is required')
    const existing = await db.select().from(tableTags).where(eq(tableTags.tableId, tableId))
    const clash = existing.find((tag) => tag.id !== tagId && tag.name.toLowerCase() === trimmed.toLowerCase())
    if (clash) throw badRequest('A tag with that name already exists')
    patch.name = trimmed
  }
  if (!patch.color && !patch.name) throw badRequest('Tag name is required')
  const [tag] = await db.update(tableTags).set(patch).where(and(eq(tableTags.id, tagId), eq(tableTags.tableId, tableId))).returning()
  if (!tag) throw notFound()
  return tag
}

export async function createStatus(db: AppDatabase, subject: Subject, tableId: string, name: string) {
  await requireEditableTable(db, subject, tableId, 'edit')
  const trimmed = name.trim()
  if (!trimmed) throw badRequest('Status name is required')
  const existing = await db.select().from(tableStatuses).where(eq(tableStatuses.tableId, tableId)).orderBy(asc(tableStatuses.position))
  const match = existing.find((status) => status.name.toLowerCase() === trimmed.toLowerCase())
  if (match) return match
  const [status] = await db.insert(tableStatuses).values({
    tableId,
    name: trimmed,
    color: nextTagColor(existing.length),
    position: positionBetween(existing),
  }).returning()
  return status
}

export async function updateStatus(db: AppDatabase, subject: Subject, tableId: string, statusId: string, input: { color?: string; name?: string }) {
  await requireEditableTable(db, subject, tableId, 'edit')
  const patch: { color?: string; name?: string } = {}
  if (typeof input.color === 'string' && input.color.trim()) patch.color = input.color.trim()
  if (input.name != null) {
    const trimmed = input.name.trim()
    if (!trimmed) throw badRequest('Status name is required')
    const existing = await db.select().from(tableStatuses).where(eq(tableStatuses.tableId, tableId))
    const clash = existing.find((status) => status.id !== statusId && status.name.toLowerCase() === trimmed.toLowerCase())
    if (clash) throw badRequest('A status with that name already exists')
    patch.name = trimmed
  }
  if (!patch.color && !patch.name) throw badRequest('Status name is required')
  const [status] = await db
    .update(tableStatuses)
    .set(patch)
    .where(and(eq(tableStatuses.id, statusId), eq(tableStatuses.tableId, tableId)))
    .returning()
  if (!status) throw notFound()
  return status
}

function storedSort(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const sort = value as { columnId?: unknown; direction?: unknown }
  if (typeof sort.columnId !== 'string' || sort.columnId.length === 0) return null
  return { columnId: sort.columnId, direction: sort.direction === 'desc' ? 'desc' : 'asc' }
}

function storedFilter(value: unknown) {
  if (value == null) return null
  if (typeof value === 'object') return value
  return null
}

export async function readUserTableState(db: AppDatabase, subject: Subject, tableId: string) {
  await requireTable(db, subject, tableId, 'view')
  if (subject.kind !== 'user') return { sort: null, filter: null }
  const [row] = await db
    .select()
    .from(userTableState)
    .where(and(eq(userTableState.userId, subject.id), eq(userTableState.tableId, tableId)))
    .limit(1)
  return { sort: row?.sort ?? null, filter: row?.filter ?? null }
}

export async function saveUserTableState(db: AppDatabase, subject: Subject, tableId: string, input: { sort?: unknown; filter?: unknown }) {
  await requireTable(db, subject, tableId, 'view')
  if (subject.kind !== 'user') return { sort: null, filter: null }
  const sort = storedSort(input.sort)
  const filter = storedFilter(input.filter)
  await db
    .insert(userTableState)
    .values({ userId: subject.id, tableId, sort, filter })
    .onConflictDoUpdate({
      target: [userTableState.userId, userTableState.tableId],
      set: { sort, filter, updatedAt: new Date() },
    })
  return { sort, filter }
}
