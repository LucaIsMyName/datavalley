import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { parseCsv, toCsv, type FilterNode, type FormatRule } from '@datavalley/shared'
import type { AppDatabase } from '../../database/client.js'
import { formulas, projectMembers, relations, relationRecords, tableCells, tableRows, tableStatuses, tableTags, tables, users } from '../../database/schema.js'
import { coerceImport, isWritable, parseCell, readCell, type CellWrite } from '../../column-types/index.js'
import { badRequest, conflict, notFound } from '../../errors.js'
import { allows, loadGrants } from '../../security/access.js'
import { writeAudit } from '../../security/audit.js'
import type { Subject } from '../../security/subject.js'
import { canonicalizeFormatRules, evaluateStored } from '../formulas/service.js'
import { loadColumns, positionBetween, requireTable, type LoadedColumn } from '../tables/service.js'
import { footerFor, queryRows, type SortSpec } from './query.js'

async function visibleColumns(db: AppDatabase, subject: Subject, tableId: string, projectId: string, columns: LoadedColumn[]) {
  const grants = await loadGrants(db, subject)
  return columns.filter((column) =>
    allows(subject, grants, 'view', { type: 'column', id: column.id, parents: { table: tableId, project: projectId } }),
  )
}

async function assertRow(db: AppDatabase, subject: Subject, rowId: string, action: 'view' | 'edit' | 'delete') {
  const [row] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
  if (!row) throw notFound()
  const table = await requireTable(db, subject, row.tableId, action === 'view' ? 'view' : action === 'delete' ? 'delete' : 'edit')
  const grants = await loadGrants(db, subject)
  if (!allows(subject, grants, action === 'delete' ? 'delete' : action === 'edit' ? 'edit' : 'view', {
    type: 'row',
    id: row.id,
    parents: { table: table.id, project: table.projectId },
  })) {
    throw notFound()
  }
  return { row, table, grants }
}

async function cellsFor(db: AppDatabase, rowIds: string[]) {
  if (rowIds.length === 0) return []
  return db.select().from(tableCells).where(inArray(tableCells.rowId, rowIds))
}

function presentRows(
  columns: LoadedColumn[],
  page: { id: string; position: string; version: number; color?: string | null; notes?: string | null; rowNumber?: number | null }[],
  cells: (typeof tableCells.$inferSelect)[],
) {
  return page.map((row) => {
    const values: Record<string, unknown> = {}
    const backgrounds: Record<string, string> = {}
    const formats: Record<string, FormatRule[]> = {}
    for (const column of columns) {
      if (column.type === 'row_id') {
        values[column.id] = column.config.style === 'uuid' ? row.id : row.rowNumber ?? null
        continue
      }
      const cell = cells.find((item) => item.rowId === row.id && item.columnId === column.id)
      values[column.id] = readCell(column, cell ? {
        valueText: cell.valueText,
        valueNumber: cell.valueNumber,
        valueBool: cell.valueBool,
        valueTimestamptz: cell.valueTimestamptz,
        valueJsonb: cell.valueJsonb,
      } : undefined)
      if (cell?.background) backgrounds[column.id] = cell.background
      if (Array.isArray(cell?.formatRules) && cell.formatRules.length > 0) formats[column.id] = cell.formatRules as FormatRule[]
    }
    return {
      id: row.id,
      position: row.position,
      version: row.version,
      color: row.color ?? null,
      notes: row.notes ?? '',
      rowNumber: row.rowNumber ?? 0,
      cells: values,
      backgrounds,
      formats,
    }
  })
}

export async function listRows(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  input: { limit?: number; cursor?: string | null; sort?: SortSpec | null; filter?: FilterNode | null; q?: string | null },
) {
  const table = await requireTable(db, subject, tableId, 'view')
  const columns = await visibleColumns(db, subject, table.id, table.projectId, await loadColumns(db, tableId))
  const page = await queryRows(db, {
    tableId,
    columns,
    subjectType: subject.kind,
    subjectId: subject.id,
    limit: input.limit ?? 50,
    cursor: input.cursor,
    sort: input.sort,
    filter: input.filter,
    q: input.q,
  })
  const cells = await cellsFor(db, page.rows.map((row) => row.id))
  const rows = presentRows(columns, page.rows, cells)
  const formulaColumns = columns.filter((column) => column.type === 'formula')
  if (formulaColumns.length > 0 && rows.length > 0) {
    const stored = await db.select().from(formulas).where(eq(formulas.tableId, table.id))
    for (const column of formulaColumns) {
      for (const row of rows) {
        const formula = stored.find((item) => item.columnId === column.id && item.rowId === row.id)
        if (!formula) continue
        try {
          row.cells[column.id] = await evaluateStored(db, subject, formula.id, row.id)
        } catch {
          row.cells[column.id] = { error: '#N/A' }
        }
      }
    }
  }
  return { rows, nextCursor: page.nextCursor, columns: columns.map((column) => column.id) }
}

async function assertReferences(db: AppDatabase, tableId: string, projectId: string, column: LoadedColumn, input: unknown) {
  if (input == null || input === '') return
  if (column.type === 'tags' || column.type === 'user') {
    const ids = Array.isArray(input) ? input.map(String) : []
    if (ids.length === 0) return
    const unique = new Set(ids)
    if (column.type === 'tags') {
      const found = await db.select({ id: tableTags.id }).from(tableTags).where(and(eq(tableTags.tableId, tableId), inArray(tableTags.id, ids)))
      if (found.length !== unique.size) throw badRequest('Unknown tag')
      return
    }
    const found = await db.select({ userId: projectMembers.userId }).from(projectMembers).where(and(eq(projectMembers.projectId, projectId), inArray(projectMembers.userId, ids)))
    if (found.length !== unique.size) throw badRequest('Unknown user')
  }
  if (column.type === 'status') {
    const [found] = await db.select({ id: tableStatuses.id }).from(tableStatuses).where(and(eq(tableStatuses.tableId, tableId), eq(tableStatuses.id, String(input)))).limit(1)
    if (!found) throw badRequest('Unknown status')
  }
}

async function writeCell(db: AppDatabase, tableId: string, rowId: string, column: LoadedColumn, value: unknown, background?: string | null) {
  const [existing] = await db
    .select()
    .from(tableCells)
    .where(and(eq(tableCells.rowId, rowId), eq(tableCells.columnId, column.id)))
    .limit(1)
  const parsed = parseCell(column, value)
  const kept = background !== undefined ? background : (existing?.background ?? null)
  const rules = storedRules(existing?.formatRules)
  await db.delete(tableCells).where(and(eq(tableCells.rowId, rowId), eq(tableCells.columnId, column.id)))
  if (!parsed && !kept && rules.length === 0) return
  await db.insert(tableCells).values({
    tableId,
    rowId,
    columnId: column.id,
    valueText: parsed?.valueText ?? null,
    valueNumber: parsed?.valueNumber ?? null,
    valueBool: parsed?.valueBool ?? null,
    valueTimestamptz: parsed?.valueTimestamptz ?? null,
    valueJsonb: (parsed?.valueJsonb ?? null) as never,
    background: kept,
    formatRules: rules as never,
  })
  if (parsed && column.type === 'relation') await syncRelation(db, column, rowId, parsed)
}

async function setBackground(db: AppDatabase, tableId: string, rowId: string, columnId: string, background: string | null) {
  const [existing] = await db
    .select()
    .from(tableCells)
    .where(and(eq(tableCells.rowId, rowId), eq(tableCells.columnId, columnId)))
    .limit(1)
  const hasValue = Boolean(
    existing &&
      (existing.valueText != null ||
        existing.valueNumber != null ||
        existing.valueBool != null ||
        existing.valueTimestamptz != null ||
        existing.valueJsonb != null),
  )
  if (!existing) {
    if (!background) return
    await db.insert(tableCells).values({ tableId, rowId, columnId, background })
    return
  }
  if (!background && !hasValue && storedRules(existing.formatRules).length === 0) {
    await db.delete(tableCells).where(eq(tableCells.id, existing.id))
    return
  }
  await db.update(tableCells).set({ background, updatedAt: new Date() }).where(eq(tableCells.id, existing.id))
}

function storedRules(value: unknown) {
  return Array.isArray(value) ? value : []
}

async function setCellFormats(db: AppDatabase, tableId: string, rowId: string, columnId: string, rules: FormatRule[]) {
  const [existing] = await db
    .select()
    .from(tableCells)
    .where(and(eq(tableCells.rowId, rowId), eq(tableCells.columnId, columnId)))
    .limit(1)
  const hasValue = Boolean(
    existing &&
      (existing.valueText != null ||
        existing.valueNumber != null ||
        existing.valueBool != null ||
        existing.valueTimestamptz != null ||
        existing.valueJsonb != null),
  )
  if (!existing) {
    if (rules.length === 0) return
    await db.insert(tableCells).values({ tableId, rowId, columnId, formatRules: rules as never })
    return
  }
  if (rules.length === 0 && !hasValue && !existing.background) {
    await db.delete(tableCells).where(eq(tableCells.id, existing.id))
    return
  }
  await db.update(tableCells).set({ formatRules: rules as never, updatedAt: new Date() }).where(eq(tableCells.id, existing.id))
}

async function syncRelation(db: AppDatabase, column: LoadedColumn, rowId: string, parsed: CellWrite) {
  const relationId = String(column.config.relationId ?? '')
  if (!relationId) return
  const [relation] = await db.select().from(relations).where(eq(relations.id, relationId)).limit(1)
  if (!relation) throw badRequest('Relation is missing')
  const targetId = (parsed.valueJsonb as { rowId?: string } | null)?.rowId
  if (!targetId) return
  const [target] = await db.select().from(tableRows).where(eq(tableRows.id, targetId)).limit(1)
  if (!target || target.tableId !== relation.toTableId) throw notFound()
  if (relation.cardinality === 'many_to_one' || relation.cardinality === 'one_to_one') {
    await db.delete(relationRecords).where(and(eq(relationRecords.relationId, relation.id), eq(relationRecords.fromRowId, rowId)))
  }
  if (relation.cardinality === 'one_to_one' || relation.cardinality === 'one_to_many') {
    const existing = await db
      .select()
      .from(relationRecords)
      .where(and(eq(relationRecords.relationId, relation.id), eq(relationRecords.toRowId, targetId)))
    if (existing.some((record) => record.fromRowId !== rowId)) throw conflict('That record is already linked')
  }
  await db.insert(relationRecords).values({ relationId: relation.id, fromRowId: rowId, toRowId: targetId }).onConflictDoNothing()
}

export async function createRow(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  cells: Record<string, unknown> = {},
  placement: { beforeId?: string; afterId?: string } = {},
) {
  const table = await requireTable(db, subject, tableId, 'create')
  const columns = await loadColumns(db, tableId)
  const existing = await db
    .select({ id: tableRows.id, position: tableRows.position })
    .from(tableRows)
    .where(eq(tableRows.tableId, tableId))
    .orderBy(asc(tableRows.position))
  const position = positionBetween(existing, placement.beforeId, placement.afterId)
  const row = await db.transaction(async (tx) => {
    const [numbered] = await tx
      .update(tables)
      .set({ nextRowNumber: sql`${tables.nextRowNumber} + 1` })
      .where(eq(tables.id, tableId))
      .returning({ nextRowNumber: tables.nextRowNumber })
    const [created] = await tx.insert(tableRows).values({ tableId, position, rowNumber: numbered.nextRowNumber - 1, createdBy: subject.id }).returning()
    for (const [columnId, value] of Object.entries(cells)) {
      const column = columns.find((item) => item.id === columnId)
      if (!column || !isWritable(column.type)) throw badRequest('Unknown column')
      await assertReferences(tx as unknown as AppDatabase, tableId, table.projectId, column, value)
      await writeCell(tx as unknown as AppDatabase, tableId, created.id, column, value)
    }
    return created
  })
  return { id: row.id, position: row.position, version: row.version }
}

export async function moveRow(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  rowId: string,
  placement: { beforeId?: string; afterId?: string },
) {
  await requireTable(db, subject, tableId, 'edit')
  const existing = await db
    .select({ id: tableRows.id, position: tableRows.position })
    .from(tableRows)
    .where(eq(tableRows.tableId, tableId))
    .orderBy(asc(tableRows.position))
  if (!existing.some((row) => row.id === rowId)) throw notFound()
  const position = positionBetween(
    existing.filter((row) => row.id !== rowId),
    placement.beforeId,
    placement.afterId,
  )
  await db.update(tableRows).set({ position, updatedAt: new Date() }).where(eq(tableRows.id, rowId))
  return { id: rowId, position }
}

export async function patchRow(
  db: AppDatabase,
  subject: Subject,
  rowId: string,
  input: { version: number; cells?: Record<string, unknown>; color?: string | null; backgrounds?: Record<string, string | null>; formats?: Record<string, FormatRule[]>; notes?: string },
) {
  const { row, table, grants } = await assertRow(db, subject, rowId, 'edit')
  if (row.version !== input.version) throw conflict('This row was changed by someone else')
  const cells = input.cells ?? {}
  const columns = await loadColumns(db, table.id)
  const columnIds = Object.keys(cells)
  for (const columnId of columnIds) {
    const column = columns.find((item) => item.id === columnId)
    if (!column) throw badRequest('Unknown column')
    if (!allows(subject, grants, 'edit', { type: 'column', id: column.id, parents: { table: table.id, project: table.projectId } })) {
      throw notFound()
    }
  }
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(tableRows)
      .set({
        version: row.version + 1,
        updatedAt: new Date(),
        ...('color' in input ? { color: input.color ?? null } : {}),
        ...('notes' in input ? { notes: input.notes ?? '' } : {}),
      })
      .where(and(eq(tableRows.id, row.id), eq(tableRows.version, input.version)))
      .returning()
    if (updated.length === 0) throw conflict('This row was changed by someone else')
    for (const [columnId, value] of Object.entries(cells)) {
      const column = columns.find((item) => item.id === columnId)!
      await assertReferences(tx as unknown as AppDatabase, table.id, table.projectId, column, value)
      await writeCell(tx as unknown as AppDatabase, table.id, row.id, column, value)
    }
    for (const [columnId, background] of Object.entries(input.backgrounds ?? {})) {
      const column = columns.find((item) => item.id === columnId)
      if (!column) throw badRequest('Unknown column')
      await setBackground(tx as unknown as AppDatabase, table.id, row.id, column.id, background)
    }
    for (const [columnId, rules] of Object.entries(input.formats ?? {})) {
      const column = columns.find((item) => item.id === columnId)
      if (!column) throw badRequest('Unknown column')
      const prepared = await canonicalizeFormatRules(tx as unknown as AppDatabase, subject, table.id, rules)
      if (prepared.some((rule) => !rule.expression)) throw badRequest('A cell condition needs a formula')
      await setCellFormats(tx as unknown as AppDatabase, table.id, row.id, column.id, prepared.map((rule) => ({ ...rule, columnId })))
    }
  })
  await writeAudit(db, subject, {
    action: 'cell.update',
    resourceType: 'row',
    resourceId: row.id,
    metadata: { columnIds },
  })
    const [fresh] = await db.select().from(tableRows).where(eq(tableRows.id, row.id))
    const stored = await cellsFor(db, [row.id])
    return presentRows(await visibleColumns(db, subject, table.id, table.projectId, columns), [fresh], stored)[0]
}

export async function deleteRow(db: AppDatabase, subject: Subject, rowId: string) {
  const { row } = await assertRow(db, subject, rowId, 'delete')
  const links = await db.select().from(relationRecords).where(eq(relationRecords.toRowId, row.id))
  if (links.length) {
    const related = await db.select().from(relations).where(inArray(relations.id, links.map((link) => link.relationId)))
    const blocking = related.filter((relation) => relation.onDelete === 'restrict' && links.some((link) => link.relationId === relation.id))
    if (blocking.length) throw conflict('Other records still reference this row', { count: links.length })
  }
  await db.delete(tableRows).where(eq(tableRows.id, row.id))
  await writeAudit(db, subject, { action: 'row.delete', resourceType: 'row', resourceId: row.id, metadata: { count: 1 } })
}

export async function bulkPatch(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  updates: { rowId: string; version: number; cells: Record<string, unknown> }[],
) {
  const cellCount = updates.reduce((sum, update) => sum + Object.keys(update.cells).length, 0)
  if (cellCount > 500) throw badRequest('Bulk updates are limited to 500 cells')
  await db.transaction(async (tx) => {
    for (const update of updates) {
      await patchRow(tx as unknown as AppDatabase, subject, update.rowId, update)
    }
  })
}

export async function bulkDelete(db: AppDatabase, subject: Subject, tableId: string, rowIds: string[]) {
  await requireTable(db, subject, tableId, 'delete')
  for (const rowId of rowIds) await deleteRow(db, subject, rowId)
  await writeAudit(db, subject, { action: 'row.bulk_delete', resourceType: 'table', resourceId: tableId, metadata: { count: rowIds.length } })
}

export async function duplicateRows(db: AppDatabase, subject: Subject, tableId: string, rowIds: string[]) {
  await requireTable(db, subject, tableId, 'create')
  const created: string[] = []
  for (const rowId of rowIds) {
    const { row } = await assertRow(db, subject, rowId, 'view')
    const cells = await cellsFor(db, [row.id])
    const copy = await createRow(db, subject, tableId)
    if (row.color || row.notes) await db.update(tableRows).set({ color: row.color, notes: row.notes }).where(eq(tableRows.id, copy.id))
    const columns = await loadColumns(db, tableId)
    for (const cell of cells) {
      const column = columns.find((item) => item.id === cell.columnId)
      if (!column) continue
      if (isWritable(column.type)) await writeCell(db, tableId, copy.id, column, readCell(column, cell), cell.background)
      if (storedRules(cell.formatRules).length > 0) await setCellFormats(db, tableId, copy.id, column.id, storedRules(cell.formatRules) as FormatRule[])
    }
    created.push(copy.id)
  }
  return created
}

export async function fillDown(db: AppDatabase, subject: Subject, tableId: string, input: { columnId: string; rowIds: string[] }) {
  if (input.rowIds.length < 2) throw badRequest('Choose at least two rows')
  const table = await requireTable(db, subject, tableId, 'edit')
  const columns = await loadColumns(db, tableId)
  const column = columns.find((item) => item.id === input.columnId)
  if (!column) throw badRequest('Unknown column')
  const source = await cellsFor(db, [input.rowIds[0]])
  const sourceCell = source.find((cell) => cell.columnId === column.id)
  const value = readCell(column, sourceCell)
  for (const rowId of input.rowIds.slice(1)) {
    const { row } = await assertRow(db, subject, rowId, 'edit')
    if (row.tableId !== table.id) throw notFound()
    await writeCell(db, tableId, rowId, column, value)
    await db.update(tableRows).set({ version: row.version + 1, updatedAt: new Date() }).where(eq(tableRows.id, rowId))
  }
}

export async function footer(db: AppDatabase, subject: Subject, tableId: string, filter?: FilterNode | null) {
  const table = await requireTable(db, subject, tableId, 'view')
  const columns = await visibleColumns(db, subject, table.id, table.projectId, await loadColumns(db, tableId))
  const result: Record<string, unknown> = {}
  for (const column of columns) {
    if (column.hidden) continue
    result[column.id] = await footerFor(db, {
      tableId,
      column,
      columns,
      subjectType: subject.kind,
      subjectId: subject.id,
      filter,
    })
  }
  return result
}

export async function importCsv(db: AppDatabase, subject: Subject, tableId: string, csv: string, chunkSize = 500) {
  const table = await requireTable(db, subject, tableId, 'import')
  const columns = await loadColumns(db, tableId)
  const grid = parseCsv(csv)
  const [header, ...records] = grid
  if (!header) throw badRequest('CSV is empty')
  const mapping = header.map((name) => columns.find((column) => column.name.toLowerCase() === name.trim().toLowerCase()) ?? null)
  const chunks: { chunk: number; error?: string }[] = []
  let created = 0
  for (let index = 0; index < records.length; index += chunkSize) {
    const slice = records.slice(index, index + chunkSize)
    const chunk = Math.floor(index / chunkSize) + 1
    try {
      await db.transaction(async (tx) => {
        for (const [rowOffset, record] of slice.entries()) {
          const cells: Record<string, unknown> = {}
          mapping.forEach((column, columnIndex) => {
            if (!column) return
            const raw = record[columnIndex] ?? ''
            if (raw === '') return
            coerceImport(column, raw)
            cells[column.id] = column.type === 'select' || column.type === 'radio' ? raw : raw
          })
          await createRow(tx as unknown as AppDatabase, subject, table.id, cells)
          void rowOffset
        }
      })
      created += slice.length
      chunks.push({ chunk })
    } catch (error) {
      chunks.push({ chunk, error: error instanceof Error ? error.message : 'Import failed' })
    }
  }
  return { created, chunks, errors: chunks.filter((chunk) => chunk.error) }
}

export async function exportCsv(db: AppDatabase, subject: Subject, tableId: string, filter?: FilterNode | null) {
  const table = await requireTable(db, subject, tableId, 'export')
  const columns = (await visibleColumns(db, subject, table.id, table.projectId, await loadColumns(db, tableId))).filter((column) => !column.hidden)
  const page = await queryRows(db, {
    tableId,
    columns,
    subjectType: subject.kind,
    subjectId: subject.id,
    limit: 100,
    filter,
  })
  const all = [...page.rows]
  let cursor = page.nextCursor
  while (cursor && all.length < 5000) {
    const next = await queryRows(db, { tableId, columns, subjectType: subject.kind, subjectId: subject.id, limit: 100, cursor, filter })
    all.push(...next.rows)
    cursor = next.nextCursor
  }
  const cells = await cellsFor(db, all.map((row) => row.id))
  const rendered = presentRows(columns, all, cells)
  const tags = await db.select().from(tableTags).where(eq(tableTags.tableId, table.id))
  const statuses = await db.select().from(tableStatuses).where(eq(tableStatuses.tableId, table.id))
  const members = await db
    .select({ userId: projectMembers.userId, username: users.username })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, table.projectId))
  const label = (column: LoadedColumn, value: unknown) => {
    if (column.type === 'tags' && Array.isArray(value)) return value.map((id) => tags.find((tag) => tag.id === id)?.name ?? String(id)).join('|')
    if (column.type === 'status' && typeof value === 'string') return statuses.find((status) => status.id === value)?.name ?? value
    if (column.type === 'user' && Array.isArray(value)) return value.map((id) => members.find((member) => member.userId === id)?.username ?? String(id)).join('|')
    return display(value)
  }
  const lines = [[...columns.map((column) => column.name), 'Notes'], ...rendered.map((row) => [...columns.map((column) => label(column, row.cells[column.id])), row.notes ?? ''])]
  return { csv: toCsv(lines), rowCount: rendered.length, truncated: Boolean(cursor) }
}

function display(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
