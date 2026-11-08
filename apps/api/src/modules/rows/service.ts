import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import {
  csvTable,
  normalizeCsvDelimiter,
  toCsv,
  type FilterNode,
  type FormatRule,
} from '@datavalley/shared'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import {
  columnOptions,
  formulas,
  projectMembers,
  relations,
  relationRecords,
  tableCells,
  tableColumns,
  tableRows,
  tableStatuses,
  tableTags,
  tables,
  users,
} from '../../database/schema.js'
import { normalizeMediaCellValue } from '@datavalley/shared'
import {
  coerceImport,
  isWritable,
  parseCell,
  readCell,
  type CellWrite,
} from '../../column-types/index.js'
import { assertMediaReadable, loadMediaFile } from '../platform/media-access.js'
import { AppError, badRequest, conflict, notFound, versionConflict } from '../../errors.js'
import { allows, assertCan, resolveGrants } from '../../security/access.js'
import { writeAudit } from '../../security/audit.js'
import type { Subject } from '../../security/subject.js'
import { canonicalizeFormatRules, evaluateFormulasForRows } from '../formulas/service.js'
import { assertNoConnectorBinding } from '../connectors/guard.js'
import { assertTableDataEditable } from '../tables/resolve.js'
import {
  ensureTextColumns,
  loadColumns,
  positionBetween,
  requireEditableTable,
  requireTable,
  resolveTableContext,
  type LoadedColumn,
} from '../tables/service.js'
import { importDuplicateWarnings } from './duplicates.js'
import { previousCellValues, recordCellHistory } from './history.js'
import { rowDisplayTitle } from './titles.js'
import { announceAssignments, readPreviousUserIds, recordTitle, titleFromInput } from './notices.js'
import { runProjectAutomations } from './automations.js'
import { footerColumns, groupSummary, queryRows, type SortSpec } from './query.js'
import { publishRealtime, publishRowUpdated, publishTableSignal } from '../realtime/publish.js'
import { visibleColumns } from './visible-columns.js'

export { visibleColumns } from './visible-columns.js'

async function assertRow(
  db: AppDatabase,
  subject: Subject,
  rowId: string,
  action: 'view' | 'edit' | 'delete',
) {
  const [row] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
  if (!row) throw notFound()
  const table = await requireTable(
    db,
    subject,
    row.tableId,
    action === 'view' ? 'view' : action === 'delete' ? 'delete' : 'edit',
  )
  if (action !== 'view') {
    assertTableDataEditable(table)
    await assertNoConnectorBinding(db, table.id)
  }
  const grants = await resolveGrants(db, subject)
  if (
    !allows(subject, grants, action === 'delete' ? 'delete' : action === 'edit' ? 'edit' : 'view', {
      type: 'row',
      id: row.id,
      parents: { table: table.id, project: table.projectId },
    })
  ) {
    throw notFound()
  }
  return { row, table, grants }
}

async function cellsFor(db: AppDatabase, rowIds: string[], columnIds?: string[]) {
  if (rowIds.length === 0) return []
  if (columnIds && columnIds.length === 0) return []
  if (!columnIds) return db.select().from(tableCells).where(inArray(tableCells.rowId, rowIds))
  return db
    .select()
    .from(tableCells)
    .where(and(inArray(tableCells.rowId, rowIds), inArray(tableCells.columnId, columnIds)))
}

function presentRows(
  columns: LoadedColumn[],
  page: {
    id: string
    position: string
    version: number
    color?: string | null
    notes?: string | null
    rowNumber?: number | null
  }[],
  cells: (typeof tableCells.$inferSelect)[],
  title: { mainColumnId?: string | null; labels?: Map<string, string> } = {},
) {
  const byKey = new Map(cells.map((cell) => [`${cell.rowId}:${cell.columnId}`, cell]))
  return page.map((row) => {
    const values: Record<string, unknown> = {}
    const backgrounds: Record<string, string> = {}
    const formats: Record<string, FormatRule[]> = {}
    for (const column of columns) {
      if (column.type === 'row_id') {
        values[column.id] = column.config.style === 'uuid' ? row.id : (row.rowNumber ?? null)
        continue
      }
      const cell = byKey.get(`${row.id}:${column.id}`)
      values[column.id] = readCell(
        column,
        cell
          ? {
              valueText: cell.valueText,
              valueNumber: cell.valueNumber,
              valueBool: cell.valueBool,
              valueTimestamptz: cell.valueTimestamptz,
              valueJsonb: cell.valueJsonb,
            }
          : undefined,
      )
      if (cell?.background) backgrounds[column.id] = cell.background
      if (Array.isArray(cell?.formatRules) && cell.formatRules.length > 0)
        formats[column.id] = cell.formatRules as FormatRule[]
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
      title: rowDisplayTitle(columns, values, title.labels ?? new Map(), row.id, title.mainColumnId),
    }
  })
}

function mainColumnIdOf(headerConfig: unknown) {
  if (!headerConfig || typeof headerConfig !== 'object') return null
  const id = (headerConfig as { mainColumnId?: unknown }).mainColumnId
  return typeof id === 'string' && id ? id : null
}

async function titleContextFor(
  db: AppDatabase,
  tableId: string,
  columns: LoadedColumn[],
  cells: (typeof tableCells.$inferSelect)[],
) {
  const [table] = await db.select({ headerConfig: tables.headerConfig }).from(tables).where(eq(tables.id, tableId)).limit(1)
  return {
    mainColumnId: mainColumnIdOf(table?.headerConfig),
    labels: await catalogLabels(db, columns, cells),
  }
}

async function catalogLabels(
  db: AppDatabase,
  columns: { id: string; type: string }[],
  cells: (typeof tableCells.$inferSelect)[],
) {
  const labels = new Map<string, string>()
  const userIds = new Set<string>()
  const statusIds = new Set<string>()
  const tagIds = new Set<string>()
  const byId = new Map(columns.map((column) => [column.id, column]))
  for (const cell of cells) {
    const column = byId.get(cell.columnId)
    if (!column || (column.type !== 'user' && column.type !== 'status' && column.type !== 'tags')) continue
    const value = readCell(column, cell)
    const ids = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
    for (const id of ids) {
      if (column.type === 'user') userIds.add(id)
      if (column.type === 'status') statusIds.add(id)
      if (column.type === 'tags') tagIds.add(id)
    }
  }
  if (userIds.size > 0) {
    const people = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, [...userIds]))
    for (const person of people) labels.set(person.id, person.username)
  }
  if (statusIds.size > 0) {
    const statuses = await db
      .select({ id: tableStatuses.id, name: tableStatuses.name })
      .from(tableStatuses)
      .where(inArray(tableStatuses.id, [...statusIds]))
    for (const status of statuses) labels.set(status.id, status.name)
  }
  if (tagIds.size > 0) {
    const tags = await db
      .select({ id: tableTags.id, name: tableTags.name })
      .from(tableTags)
      .where(inArray(tableTags.id, [...tagIds]))
    for (const tag of tags) labels.set(tag.id, tag.name)
  }
  return labels
}

async function attachRelationLabels<T extends { cells: Record<string, unknown> }>(
  db: AppDatabase,
  columns: { id: string; type: string }[],
  rows: T[],
) {
  const ids: string[] = []
  for (const row of rows) {
    for (const column of columns) {
      if (column.type !== 'relation') continue
      const id = row.cells[column.id]
      if (typeof id === 'string' && id) ids.push(id)
    }
  }
  const titles = await recordTitles(db, [...new Set(ids)])
  for (const row of rows) {
    const labels: Record<string, { rowId: string; title: string }> = {}
    for (const column of columns) {
      if (column.type !== 'relation') continue
      const id = row.cells[column.id]
      if (typeof id !== 'string' || !id) continue
      const title = titles.get(id)
      if (title) labels[column.id] = { rowId: id, title }
    }
    ;(row as T & { relationLabels?: Record<string, { rowId: string; title: string }> }).relationLabels = labels
  }
  return rows
}

async function presentRowRecord(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  projectId: string,
  rowId: string,
) {
  const [fresh] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
  if (!fresh) throw notFound()
  const columns = await loadColumns(db, tableId)
  const visible = await visibleColumns(db, subject, tableId, projectId, columns)
  const stored = await cellsFor(db, [rowId], visible.map((column) => column.id))
  const [presented] = await attachRelationLabels(
    db,
    visible,
    await attachFormulaValues(
      db,
      subject,
      tableId,
      visible,
      presentRows(visible, [fresh], stored, await titleContextFor(db, tableId, visible, stored)),
    ),
  )
  return presented
}

export type RecordLink = {
  tableId: string
  tableName: string
  rowId: string
  title: string
  columnName: string
}

export type RecordActivity = {
  at: string
  kind: 'notes' | 'record'
  text: string
  tableId: string
  tableName: string
  rowId: string
  title: string
}

async function recordTitles(db: AppDatabase, rowIds: string[]) {
  const titles = new Map<string, string>()
  if (rowIds.length === 0) return titles
  const rows = await db.select().from(tableRows).where(inArray(tableRows.id, rowIds))
  const tableIds = [...new Set(rows.map((row) => row.tableId))]
  const storedTables = await db.select({ id: tables.id, headerConfig: tables.headerConfig }).from(tables).where(inArray(tables.id, tableIds))
  const mainByTable = new Map(storedTables.map((table) => [table.id, mainColumnIdOf(table.headerConfig)]))
  const columns = await db.select().from(tableColumns).where(inArray(tableColumns.tableId, tableIds))
  const options = columns.length
    ? await db.select().from(columnOptions).where(inArray(columnOptions.columnId, columns.map((column) => column.id)))
    : []
  const cells = await db.select().from(tableCells).where(inArray(tableCells.rowId, rowIds))
  const shaped = columns.map((column) => ({
    id: column.id,
    tableId: column.tableId,
    type: column.type,
    name: column.name,
    position: column.position,
    options: options
      .filter((option) => option.columnId === column.id)
      .map((option) => ({ id: option.id, label: option.label })),
  }))
  const labels = await catalogLabels(db, shaped, cells)
  for (const row of rows) {
    const rowColumns = shaped.filter((column) => column.tableId === row.tableId)
    const values: Record<string, unknown> = {}
    for (const column of rowColumns) {
      const cell = cells.find((item) => item.rowId === row.id && item.columnId === column.id)
      values[column.id] =
        column.type === 'row_id'
          ? row.rowNumber
          : readCell(column, cell)
    }
    titles.set(row.id, rowDisplayTitle(rowColumns, values, labels, row.id, mainByTable.get(row.tableId)))
  }
  return titles
}

export async function getRecord(db: AppDatabase, subject: Subject, rowId: string) {
  const [stored] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
  if (!stored) throw notFound()
  const { shell, physical } = await resolveTableContext(db, subject, stored.tableId, 'view')
  await assertCan(db, subject, 'view', {
    type: 'row',
    id: rowId,
    parents: { table: shell.id, project: shell.projectId },
  })
  const columns = await visibleColumns(
    db,
    subject,
    shell.id,
    shell.projectId,
    await loadColumns(db, physical.id),
  )
  const row = await presentRowRecord(db, subject, physical.id, shell.projectId, rowId)
  const grants = await resolveGrants(db, subject)
  const candidates: { tableId: string; rowId: string; columnName: string }[] = []
  for (const column of columns) {
    if (column.type !== 'relation') continue
    const targetId = row.cells[column.id]
    if (typeof targetId !== 'string' || targetId.length === 0) continue
    candidates.push({ tableId: String(column.config.toTableId ?? ''), rowId: targetId, columnName: column.name })
  }
  const incoming = await db
    .select({
      relationId: relationRecords.relationId,
      fromRowId: relationRecords.fromRowId,
    })
    .from(relationRecords)
    .where(eq(relationRecords.toRowId, rowId))
  if (incoming.length > 0) {
    const relationIds = [...new Set(incoming.map((link) => link.relationId))]
    const relationRows = await db.select().from(relations).where(inArray(relations.id, relationIds))
    const columnIds = relationRows
      .map((relation) => relation.fromColumnId)
      .filter((id): id is string => Boolean(id))
    const fromColumns = columnIds.length
      ? await db.select().from(tableColumns).where(inArray(tableColumns.id, columnIds))
      : []
    for (const link of incoming) {
      const relation = relationRows.find((item) => item.id === link.relationId)
      if (!relation || relation.fromTableId === physical.id) continue
      const column = fromColumns.find((item) => item.id === relation.fromColumnId)
      candidates.push({
        tableId: relation.fromTableId,
        rowId: link.fromRowId,
        columnName: column?.name ?? '',
      })
    }
  }
  const linkedRows = candidates.length
    ? await db
        .select()
        .from(tableRows)
        .where(
          inArray(
            tableRows.id,
            candidates.map((item) => item.rowId),
          ),
        )
    : []
  const linkedTables = linkedRows.length
    ? await db
        .select()
        .from(tables)
        .where(
          inArray(
            tables.id,
            [...new Set(linkedRows.map((item) => item.tableId))],
          ),
        )
    : []
  const titles = await recordTitles(
    db,
    linkedRows.map((item) => item.id),
  )
  const links: RecordLink[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const linked = linkedRows.find((item) => item.id === candidate.rowId)
    const table = linkedTables.find((item) => item.id === linked?.tableId)
    if (!linked || !table) continue
    const key = `${table.id}:${linked.id}:${candidate.columnName}`
    if (seen.has(key)) continue
    if (
      !allows(subject, grants, 'view', {
        type: 'row',
        id: linked.id,
        parents: { table: table.id, project: table.projectId },
      })
    )
      continue
    seen.add(key)
    links.push({
      tableId: table.id,
      tableName: table.name,
      rowId: linked.id,
      title: titles.get(linked.id) ?? `#${linked.rowNumber}`,
      columnName: candidate.columnName,
    })
  }
  const activity: RecordActivity[] = []
  if (stored.notes.trim()) {
    activity.push({
      at: stored.updatedAt.toISOString(),
      kind: 'notes',
      text: stored.notes,
      tableId: shell.id,
      tableName: shell.name,
      rowId: stored.id,
      title: '',
    })
  }
  const activityRows = new Set<string>()
  for (const link of links) {
    if (activityRows.has(link.rowId)) continue
    const linked = linkedRows.find((item) => item.id === link.rowId)
    const table = linkedTables.find((item) => item.id === linked?.tableId)
    if (!linked || !table?.activity) continue
    activityRows.add(link.rowId)
    activity.push({
      at: linked.createdAt.toISOString(),
      kind: 'record',
      text: linked.notes ?? '',
      tableId: link.tableId,
      tableName: link.tableName,
      rowId: link.rowId,
      title: link.title,
    })
  }
  activity.sort((left, right) => right.at.localeCompare(left.at))
  return { row, tableId: shell.id, links, activity }
}

async function attachFormulaValues<T extends { id: string; cells: Record<string, unknown> }>(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  columns: LoadedColumn[],
  rows: T[],
) {
  const formulaColumns = columns.filter((column) => column.type === 'formula')
  if (formulaColumns.length === 0 || rows.length === 0) return rows
  const rowIds = rows.map((row) => row.id)
  const formulaColumnIds = formulaColumns.map((column) => column.id)
  const stored = await db
    .select()
    .from(formulas)
    .where(
      and(
        eq(formulas.tableId, tableId),
        inArray(formulas.rowId, rowIds),
        inArray(formulas.columnId, formulaColumnIds),
      ),
    )
  try {
    const evaluated = await evaluateFormulasForRows(db, subject, stored)
    for (const row of rows) {
      for (const column of formulaColumns) {
        const value = evaluated.get(`${row.id}:${column.id}`)
        if (value !== undefined) row.cells[column.id] = value
      }
    }
  } catch {
    for (const row of rows) {
      for (const column of formulaColumns) {
        if (stored.some((item) => item.columnId === column.id && item.rowId === row.id)) {
          row.cells[column.id] = { error: '#N/A' }
        }
      }
    }
  }
  return rows
}

export async function listRows(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  input: {
    limit?: number
    cursor?: string | null
    sort?: SortSpec | null
    filter?: FilterNode | null
    q?: string | null
  },
) {
  const { shell, physical } = await resolveTableContext(db, subject, tableId, 'view')
  const columns = await visibleColumns(
    db,
    subject,
    shell.id,
    shell.projectId,
    await loadColumns(db, physical.id),
  )
  const page = await queryRows(db, {
    tableId: physical.id,
    columns,
    subjectType: subject.kind,
    subjectId: subject.id,
    limit: input.limit ?? 50,
    cursor: input.cursor,
    sort: input.sort,
    filter: input.filter,
    q: input.q,
  })
  const cells = await cellsFor(
    db,
    page.rows.map((row) => row.id),
    columns.map((column) => column.id),
  )
  const rows = await attachRelationLabels(
    db,
    columns,
    await attachFormulaValues(
      db,
      subject,
      physical.id,
      columns,
      presentRows(columns, page.rows, cells, await titleContextFor(db, physical.id, columns, cells)),
    ),
  )
  return { rows, nextCursor: page.nextCursor, columns: columns.map((column) => column.id) }
}

async function assertReferences(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  projectId: string,
  column: LoadedColumn,
  input: unknown,
) {
  if (input == null || input === '') return
  if (column.type === 'tags' || column.type === 'user') {
    const ids = Array.isArray(input) ? input.map(String) : []
    if (ids.length === 0) return
    const unique = new Set(ids)
    if (column.type === 'tags') {
      const found = await db
        .select({ id: tableTags.id })
        .from(tableTags)
        .where(and(eq(tableTags.tableId, tableId), inArray(tableTags.id, ids)))
      if (found.length !== unique.size) throw badRequest('Unknown tag')
      return
    }
    const found = await db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), inArray(projectMembers.userId, ids)))
    if (found.length !== unique.size) throw badRequest('Unknown user')
  }
  if (column.type === 'status') {
    const [found] = await db
      .select({ id: tableStatuses.id })
      .from(tableStatuses)
      .where(and(eq(tableStatuses.tableId, tableId), eq(tableStatuses.id, String(input))))
      .limit(1)
    if (!found) throw badRequest('Unknown status')
  }
  if (column.type === 'media') {
    const value = normalizeMediaCellValue(input)
    if (!value) return
    for (const fileId of value.fileIds) {
      const file = await loadMediaFile(db, fileId)
      if (!file) throw badRequest('Unknown file')
      await assertMediaReadable(db, subject, file)
    }
  }
}

async function writeCell(
  db: AppDatabase,
  tableId: string,
  rowId: string,
  column: LoadedColumn,
  value: unknown,
  background?: string | null,
) {
  const [existing] = await db
    .select()
    .from(tableCells)
    .where(and(eq(tableCells.rowId, rowId), eq(tableCells.columnId, column.id)))
    .limit(1)
  const parsed = parseCell(column, value)
  const kept = background !== undefined ? background : (existing?.background ?? null)
  const rules = storedRules(existing?.formatRules)
  if (!parsed && !kept && rules.length === 0) {
    if (existing)
      await db
        .delete(tableCells)
        .where(and(eq(tableCells.rowId, rowId), eq(tableCells.columnId, column.id)))
    return
  }
  const record = {
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
    updatedAt: new Date(),
  }
  await db
    .insert(tableCells)
    .values(record)
    .onConflictDoUpdate({
      target: [tableCells.rowId, tableCells.columnId],
      set: {
        valueText: record.valueText,
        valueNumber: record.valueNumber,
        valueBool: record.valueBool,
        valueTimestamptz: record.valueTimestamptz,
        valueJsonb: record.valueJsonb,
        background: record.background,
        formatRules: record.formatRules,
        updatedAt: record.updatedAt,
      },
    })
  if (parsed && column.type === 'relation') await syncRelation(db, column, rowId, parsed)
}

async function setBackground(
  db: AppDatabase,
  tableId: string,
  rowId: string,
  columnId: string,
  background: string | null,
) {
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
  await db
    .update(tableCells)
    .set({ background, updatedAt: new Date() })
    .where(eq(tableCells.id, existing.id))
}

function storedRules(value: unknown) {
  return Array.isArray(value) ? value : []
}

async function setCellFormats(
  db: AppDatabase,
  tableId: string,
  rowId: string,
  columnId: string,
  rules: FormatRule[],
) {
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
  await db
    .update(tableCells)
    .set({ formatRules: rules as never, updatedAt: new Date() })
    .where(eq(tableCells.id, existing.id))
}

async function syncRelation(
  db: AppDatabase,
  column: LoadedColumn,
  rowId: string,
  parsed: CellWrite,
) {
  const relationId = String(column.config.relationId ?? '')
  if (!relationId) return
  const [relation] = await db.select().from(relations).where(eq(relations.id, relationId)).limit(1)
  if (!relation) throw badRequest('Relation is missing')
  const targetId = (parsed.valueJsonb as { rowId?: string } | null)?.rowId
  if (!targetId) return
  const [target] = await db.select().from(tableRows).where(eq(tableRows.id, targetId)).limit(1)
  if (!target || target.tableId !== relation.toTableId) throw notFound()
  if (relation.cardinality === 'many_to_one' || relation.cardinality === 'one_to_one') {
    await db
      .delete(relationRecords)
      .where(and(eq(relationRecords.relationId, relation.id), eq(relationRecords.fromRowId, rowId)))
  }
  if (relation.cardinality === 'one_to_one' || relation.cardinality === 'one_to_many') {
    const existing = await db
      .select()
      .from(relationRecords)
      .where(
        and(eq(relationRecords.relationId, relation.id), eq(relationRecords.toRowId, targetId)),
      )
    if (existing.some((record) => record.fromRowId !== rowId))
      throw conflict('That record is already linked')
  }
  await db
    .insert(relationRecords)
    .values({ relationId: relation.id, fromRowId: rowId, toRowId: targetId })
    .onConflictDoNothing()
}

export async function createRow(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  cells: Record<string, unknown> = {},
  placement: { beforeId?: string; afterId?: string } = {},
  notify = true,
  env?: Env,
) {
  const table = await requireEditableTable(db, subject, tableId, 'edit')
  const dataTableId = table.mirrorOfTableId ?? table.id
  const columns = await loadColumns(db, dataTableId)
  const existing = await db
    .select({ id: tableRows.id, position: tableRows.position })
    .from(tableRows)
    .where(eq(tableRows.tableId, dataTableId))
    .orderBy(asc(tableRows.position))
  const position = positionBetween(existing, placement.beforeId, placement.afterId)
  const row = await db.transaction(async (tx) => {
    const [numbered] = await tx
      .update(tables)
      .set({ nextRowNumber: sql`${tables.nextRowNumber} + 1` })
      .where(eq(tables.id, dataTableId))
      .returning({ nextRowNumber: tables.nextRowNumber })
    const [created] = await tx
      .insert(tableRows)
      .values({
        tableId: dataTableId,
        position,
        rowNumber: numbered.nextRowNumber - 1,
        createdBy: subject.id,
      })
      .returning()
    for (const [columnId, value] of Object.entries(cells)) {
      const column = columns.find((item) => item.id === columnId)
      if (!column || !isWritable(column.type)) throw badRequest('Unknown column')
      await assertReferences(
        tx as unknown as AppDatabase,
        subject,
        dataTableId,
        table.projectId,
        column,
        value,
      )
      await writeCell(tx as unknown as AppDatabase, dataTableId, created.id, column, value)
    }
    return created
  })
  if (notify) await publishTableSignal(db, subject.id, table.id, 'rows.changed')
  await recordCellHistory(
    db,
    subject.kind === 'user' ? subject.id : null,
    dataTableId,
    columns,
    Object.keys(cells).map((columnId) => ({ rowId: row.id, columnId, before: null, after: cells[columnId] })),
  )
  await announceAssignments(
    db,
    env,
    subject,
    { id: dataTableId, name: table.name, projectId: table.projectId },
    row.id,
    columns,
    cells,
    new Map(),
    titleFromInput(columns, cells),
  )
  return { id: row.id, position: row.position, version: row.version }
}

export async function moveRow(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  rowId: string,
  placement: { beforeId?: string; afterId?: string },
) {
  const table = await requireEditableTable(db, subject, tableId, 'edit')
  const dataTableId = table.mirrorOfTableId ?? table.id
  const existing = await db
    .select({ id: tableRows.id, position: tableRows.position })
    .from(tableRows)
    .where(eq(tableRows.tableId, dataTableId))
    .orderBy(asc(tableRows.position))
  if (!existing.some((row) => row.id === rowId)) throw notFound()
  const position = positionBetween(
    existing.filter((row) => row.id !== rowId),
    placement.beforeId,
    placement.afterId,
  )
  await db.update(tableRows).set({ position, updatedAt: new Date() }).where(eq(tableRows.id, rowId))
  await publishTableSignal(db, subject.id, table.id, 'rows.changed')
  return { id: rowId, position }
}

export async function patchRow(
  db: AppDatabase,
  subject: Subject,
  rowId: string,
  input: {
    version: number
    cells?: Record<string, unknown>
    color?: string | null
    backgrounds?: Record<string, string | null>
    formats?: Record<string, FormatRule[]>
    notes?: string
  },
  env?: Env,
) {
  const { row, table, grants } = await assertRow(db, subject, rowId, 'edit')
  const cells = input.cells ?? {}
  const columns = await loadColumns(db, table.id)
  const columnIds = Object.keys(cells)
  for (const columnId of columnIds) {
    const column = columns.find((item) => item.id === columnId)
    if (!column) throw badRequest('Unknown column')
    if (
      !allows(subject, grants, 'edit', {
        type: 'column',
        id: column.id,
        parents: { table: table.id, project: table.projectId },
      })
    ) {
      throw notFound()
    }
  }
  const previousValues = await previousCellValues(
    db,
    columns,
    columnIds.map((columnId) => ({ rowId: row.id, columnId })),
  )
  const previousAssignees = await readPreviousUserIds(
    db,
    columnIds
      .filter((columnId) => columns.find((item) => item.id === columnId)?.type === 'user')
      .map((columnId) => ({ rowId: row.id, columnId })),
  )
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(tableRows)
      .set({
        version: sql`${tableRows.version} + 1`,
        updatedAt: new Date(),
        ...('color' in input ? { color: input.color ?? null } : {}),
        ...('notes' in input ? { notes: input.notes ?? '' } : {}),
      })
      .where(and(eq(tableRows.id, row.id), eq(tableRows.version, input.version)))
      .returning()
    if (updated.length === 0) {
      const [stillThere] = await tx
        .select()
        .from(tableRows)
        .where(eq(tableRows.id, row.id))
        .limit(1)
      if (!stillThere) throw notFound()
      if (stillThere.version !== input.version) {
        const current = await presentRowRecord(
          tx as unknown as AppDatabase,
          subject,
          table.id,
          table.projectId,
          row.id,
        )
        throw versionConflict(undefined, { row: current })
      }
      throw notFound()
    }
    for (const [columnId, value] of Object.entries(cells)) {
      const column = columns.find((item) => item.id === columnId)!
      await assertReferences(
        tx as unknown as AppDatabase,
        subject,
        table.id,
        table.projectId,
        column,
        value,
      )
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
      const prepared = await canonicalizeFormatRules(
        tx as unknown as AppDatabase,
        subject,
        table.id,
        rules,
      )
      if (prepared.some((rule) => !rule.expression))
        throw badRequest('A cell condition needs a formula')
      await setCellFormats(
        tx as unknown as AppDatabase,
        table.id,
        row.id,
        column.id,
        prepared.map((rule) => ({ ...rule, columnId })),
      )
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
  const visible = await visibleColumns(db, subject, table.id, table.projectId, columns)
  const [presented] = await attachRelationLabels(
    db,
    visible,
    await attachFormulaValues(
      db,
      subject,
      table.id,
      visible,
      presentRows(visible, [fresh], stored, await titleContextFor(db, table.id, visible, stored)),
    ),
  )
  publishRowUpdated(subject.id, table.projectId, table.id, presented)
  publishRealtime(table.projectId, {
    type: 'rows.changed',
    actorId: subject.id,
    projectId: table.projectId,
    tableId: table.id,
  })
  await announceAssignments(
    db,
    env,
    subject,
    { id: table.id, name: table.name, projectId: table.projectId },
    row.id,
    columns,
    cells,
    previousAssignees,
    recordTitle(columns, stored, row.id),
  )
  const historyChanges = columnIds.map((columnId) => ({
    rowId: row.id,
    columnId,
    before: previousValues.get(`${row.id}:${columnId}`) ?? null,
    after: cells[columnId],
  }))
  await recordCellHistory(db, subject.kind === 'user' ? subject.id : null, table.id, columns, historyChanges)
  await followStageChanges(db, subject, table, columns, historyChanges, env)
  return presented
}

export async function deleteRow(db: AppDatabase, subject: Subject, rowId: string, notify = true) {
  const { row, table } = await assertRow(db, subject, rowId, 'delete')
  const links = await db.select().from(relationRecords).where(eq(relationRecords.toRowId, row.id))
  if (links.length) {
    const related = await db
      .select()
      .from(relations)
      .where(
        inArray(
          relations.id,
          links.map((link) => link.relationId),
        ),
      )
    const blocking = related.filter(
      (relation) =>
        relation.onDelete === 'restrict' && links.some((link) => link.relationId === relation.id),
    )
    if (blocking.length)
      throw conflict('Other records still reference this row', { count: links.length })
  }
  await db.delete(tableRows).where(eq(tableRows.id, row.id))
  await writeAudit(db, subject, {
    action: 'row.delete',
    resourceType: 'row',
    resourceId: row.id,
    metadata: { count: 1 },
  })
  if (notify) await publishTableSignal(db, subject.id, table.id, 'rows.changed')
}

export async function bulkPatch(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  updates: { rowId: string; version: number; cells: Record<string, unknown> }[],
  env?: Env,
) {
  const cellCount = updates.reduce((sum, update) => sum + Object.keys(update.cells).length, 0)
  if (cellCount > 500) throw badRequest('Bulk updates are limited to 500 cells')
  if (updates.length === 0) return []
  const table = await requireEditableTable(db, subject, tableId, 'edit')
  const dataTableId = table.mirrorOfTableId ?? table.id
  const columns = await loadColumns(db, dataTableId)
  const columnById = new Map(columns.map((column) => [column.id, column]))
  const grants = await resolveGrants(db, subject)
  const rowIds = [...new Set(updates.map((update) => update.rowId))]
  const existing = await db.select().from(tableRows).where(inArray(tableRows.id, rowIds))
  const rowById = new Map(existing.map((row) => [row.id, row]))
  for (const update of updates) {
    const row = rowById.get(update.rowId)
    if (!row || row.tableId !== dataTableId) throw notFound()
    if (
      !allows(subject, grants, 'edit', {
        type: 'row',
        id: row.id,
        parents: { table: dataTableId, project: table.projectId },
      })
    ) {
      throw notFound()
    }
    for (const columnId of Object.keys(update.cells)) {
      const column = columnById.get(columnId)
      if (!column) throw badRequest('Unknown column')
      if (
        !allows(subject, grants, 'edit', {
          type: 'column',
          id: column.id,
          parents: { table: dataTableId, project: table.projectId },
        })
      ) {
        throw notFound()
      }
    }
  }
  const previousValues = await previousCellValues(
    db,
    columns,
    updates.flatMap((update) => Object.keys(update.cells).map((columnId) => ({ rowId: update.rowId, columnId }))),
  )
  const previousAssignees = await readPreviousUserIds(
    db,
    updates.flatMap((update) =>
      Object.keys(update.cells)
        .filter((columnId) => columnById.get(columnId)?.type === 'user')
        .map((columnId) => ({ rowId: update.rowId, columnId })),
    ),
  )
  await db.transaction(async (tx) => {
    const database = tx as unknown as AppDatabase
    for (const update of updates) {
      const row = rowById.get(update.rowId)!
      const updated = await database
        .update(tableRows)
        .set({ version: sql`${tableRows.version} + 1`, updatedAt: new Date() })
        .where(and(eq(tableRows.id, row.id), eq(tableRows.version, update.version)))
        .returning()
      if (updated.length === 0) {
        const [stillThere] = await database
          .select()
          .from(tableRows)
          .where(eq(tableRows.id, row.id))
          .limit(1)
        if (!stillThere) throw notFound()
        if (stillThere.version !== update.version) {
          const current = await presentRowRecord(
            database,
            subject,
            dataTableId,
            table.projectId,
            row.id,
          )
          throw versionConflict(undefined, { row: current, rowId: row.id })
        }
        throw notFound()
      }
      for (const [columnId, value] of Object.entries(update.cells)) {
        const column = columnById.get(columnId)!
        await assertReferences(database, subject, dataTableId, table.projectId, column, value)
        await writeCell(database, dataTableId, row.id, column, value)
      }
    }
  })
  await writeAudit(db, subject, {
    action: 'cell.bulk_update',
    resourceType: 'table',
    resourceId: table.id,
    metadata: { count: cellCount, rows: rowIds.length },
  })
  const fresh = await db.select().from(tableRows).where(inArray(tableRows.id, rowIds))
  const stored = await cellsFor(db, rowIds)
  const visible = await visibleColumns(db, subject, dataTableId, table.projectId, columns)
  const presented = await attachRelationLabels(
    db,
    visible,
    await attachFormulaValues(
      db,
      subject,
      dataTableId,
      visible,
      presentRows(visible, fresh, stored, await titleContextFor(db, dataTableId, visible, stored)),
    ),
  )
  for (const row of presented) publishRowUpdated(subject.id, table.projectId, table.id, row)
  publishRealtime(table.projectId, {
    type: 'rows.changed',
    actorId: subject.id,
    projectId: table.projectId,
    tableId: table.id,
  })
  for (const update of updates) {
    await announceAssignments(
      db,
      env,
      subject,
      { id: dataTableId, name: table.name, projectId: table.projectId },
      update.rowId,
      columns,
      update.cells,
      previousAssignees,
      recordTitle(columns, stored, update.rowId),
    )
  }
  const historyChanges = updates.flatMap((update) =>
    Object.keys(update.cells).map((columnId) => ({
      rowId: update.rowId,
      columnId,
      before: previousValues.get(`${update.rowId}:${columnId}`) ?? null,
      after: update.cells[columnId],
    })),
  )
  await recordCellHistory(db, subject.kind === 'user' ? subject.id : null, dataTableId, columns, historyChanges)
  await followStageChanges(db, subject, { ...table, id: dataTableId }, columns, historyChanges, env)
  return presented
}

async function writeAutomationCells(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  rowId: string,
  cells: Record<string, unknown>,
) {
  const columns = await loadColumns(db, tableId)
  for (const [columnId, value] of Object.entries(cells)) {
    const column = columns.find((item) => item.id === columnId)
    if (!column) continue
    await writeCell(db, tableId, rowId, column, value)
  }
  await db
    .update(tableRows)
    .set({ version: sql`${tableRows.version} + 1`, updatedAt: new Date() })
    .where(eq(tableRows.id, rowId))
  await publishTableSignal(db, subject.id, tableId, 'rows.changed')
}

async function followStageChanges(
  db: AppDatabase,
  subject: Subject,
  table: { id: string; name: string; projectId: string },
  columns: LoadedColumn[],
  changes: { rowId: string; columnId: string; before: unknown; after: unknown }[],
  env?: Env,
) {
  try {
    await runProjectAutomations(db, subject, table, columns, changes, {
      create: (tableId, cells) => createRow(db, subject, tableId, cells, {}, true, env),
      update: (tableId, rowId, cells) => writeAutomationCells(db, subject, tableId, rowId, cells),
    })
  } catch (error) {
    if (error instanceof AppError && error.status < 500) return
    throw error
  }
}

export async function bulkDelete(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  rowIds: string[],
) {
  await requireEditableTable(db, subject, tableId, 'delete')
  const existing = rowIds.length
    ? await db.select({ id: tableRows.id, notes: tableRows.notes }).from(tableRows).where(inArray(tableRows.id, rowIds))
    : []
  const notes = Object.fromEntries(existing.map((row) => [row.id, row.notes ?? '']))
  for (const rowId of rowIds) await deleteRow(db, subject, rowId, false)
  await writeAudit(db, subject, {
    action: 'row.bulk_delete',
    resourceType: 'table',
    resourceId: tableId,
    metadata: { count: rowIds.length },
  })
  await publishTableSignal(db, subject.id, tableId, 'rows.changed')
  return notes
}

export async function duplicateRows(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  rowIds: string[],
) {
  await requireEditableTable(db, subject, tableId, 'edit')
  const created: string[] = []
  const notes: Record<string, string> = {}
  for (const rowId of rowIds) {
    const { row } = await assertRow(db, subject, rowId, 'view')
    notes[row.id] = row.notes ?? ''
    const cells = await cellsFor(db, [row.id])
    const copy = await createRow(db, subject, tableId, {}, {}, false)
    if (row.color || row.notes)
      await db
        .update(tableRows)
        .set({ color: row.color, notes: row.notes })
        .where(eq(tableRows.id, copy.id))
    const columns = await loadColumns(db, tableId)
    for (const cell of cells) {
      const column = columns.find((item) => item.id === cell.columnId)
      if (!column) continue
      if (isWritable(column.type))
        await writeCell(db, tableId, copy.id, column, readCell(column, cell), cell.background)
      if (storedRules(cell.formatRules).length > 0)
        await setCellFormats(
          db,
          tableId,
          copy.id,
          column.id,
          storedRules(cell.formatRules) as FormatRule[],
        )
    }
    created.push(copy.id)
  }
  await publishTableSignal(db, subject.id, tableId, 'rows.changed')
  return { rowIds: created, notes }
}

export async function fillDown(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  input: { columnId: string; rowIds: string[]; versions?: Record<string, number> },
) {
  if (input.rowIds.length < 2) throw badRequest('Choose at least two rows')
  const table = await requireEditableTable(db, subject, tableId, 'edit')
  const dataTableId = table.mirrorOfTableId ?? table.id
  const columns = await loadColumns(db, dataTableId)
  const column = columns.find((item) => item.id === input.columnId)
  if (!column) throw badRequest('Unknown column')
  const grants = await resolveGrants(db, subject)
  if (
    !allows(subject, grants, 'edit', {
      type: 'column',
      id: column.id,
      parents: { table: dataTableId, project: table.projectId },
    })
  ) {
    throw notFound()
  }
  const { row: sourceRow } = await assertRow(db, subject, input.rowIds[0], 'view')
  if (sourceRow.tableId !== dataTableId) throw notFound()
  const source = await cellsFor(db, [sourceRow.id])
  const sourceCell = source.find((cell) => cell.columnId === column.id)
  const value = readCell(column, sourceCell)
  await db.transaction(async (tx) => {
    const database = tx as unknown as AppDatabase
    for (const rowId of input.rowIds.slice(1)) {
      const { row } = await assertRow(database, subject, rowId, 'edit')
      if (row.tableId !== dataTableId) throw notFound()
      const expected = input.versions?.[rowId] ?? row.version
      const updated = await database
        .update(tableRows)
        .set({ version: sql`${tableRows.version} + 1`, updatedAt: new Date() })
        .where(and(eq(tableRows.id, row.id), eq(tableRows.version, expected)))
        .returning()
      if (updated.length === 0) {
        const [stillThere] = await database
          .select()
          .from(tableRows)
          .where(eq(tableRows.id, row.id))
          .limit(1)
        if (!stillThere) throw notFound()
        if (stillThere.version !== expected) {
          const current = await presentRowRecord(database, subject, dataTableId, table.projectId, row.id)
          throw versionConflict(undefined, { row: current, rowId: row.id })
        }
        throw notFound()
      }
      await writeCell(database, dataTableId, row.id, column, value)
    }
  })
  await publishTableSignal(db, subject.id, table.id, 'rows.changed')
}

export async function linkRelationRecord(
  db: AppDatabase,
  subject: Subject,
  relationId: string,
  fromRowId: string,
  toRowId: string,
) {
  const [relation] = await db.select().from(relations).where(eq(relations.id, relationId)).limit(1)
  if (!relation) throw notFound()
  const { row: fromRow } = await assertRow(db, subject, fromRowId, 'edit')
  if (fromRow.tableId !== relation.fromTableId) throw notFound()
  const { row: target } = await assertRow(db, subject, toRowId, 'view')
  if (target.tableId !== relation.toTableId) throw notFound()
  const [existing] = await db
    .select()
    .from(relationRecords)
    .where(and(eq(relationRecords.relationId, relation.id), eq(relationRecords.toRowId, target.id)))
  if ((relation.cardinality === 'one_to_one' || relation.cardinality === 'one_to_many') && existing) {
    throw conflict('That record is already linked')
  }
  await db.insert(relationRecords).values({ relationId: relation.id, fromRowId: fromRow.id, toRowId: target.id })
  return { ok: true as const }
}

export async function footer(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  filter?: FilterNode | null,
  columnIds?: string[],
) {
  const { shell, physical } = await resolveTableContext(db, subject, tableId, 'view')
  const columns = await visibleColumns(
    db,
    subject,
    shell.id,
    shell.projectId,
    await loadColumns(db, physical.id),
  )
  const chosen = (columnIds ? columns.filter((column) => columnIds.includes(column.id)) : columns).filter((column) => !column.hidden)
  return footerColumns(db, {
    tableId: physical.id,
    columns: chosen,
    catalog: columns,
    subjectType: subject.kind,
    subjectId: subject.id,
    filter,
  })
}

export async function tableSummary(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  input: { dimensionId: string; valueIds: string[]; filter?: FilterNode | null },
) {
  const { shell, physical } = await resolveTableContext(db, subject, tableId, 'view')
  const columns = await visibleColumns(
    db,
    subject,
    shell.id,
    shell.projectId,
    await loadColumns(db, physical.id),
  )
  const dimension = columns.find((column) => column.id === input.dimensionId && !column.hidden)
  if (!dimension) throw badRequest('Unknown column')
  const values = input.valueIds.flatMap((id) => {
    const column = columns.find((item) => item.id === id && !item.hidden)
    if (!column || (column.type !== 'number' && column.type !== 'currency')) return []
    return [column]
  })
  return {
    groups: await groupSummary(db, {
      tableId: physical.id,
      dimension,
      values,
      columns,
      subjectType: subject.kind,
      subjectId: subject.id,
      filter: input.filter,
    }),
  }
}

export async function importCsv(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  csv: string,
  options: { headerRow?: boolean; delimiter?: string; chunkSize?: number } = {},
) {
  const table = await requireEditableTable(db, subject, tableId, 'edit')
  let delimiter = ','
  try {
    delimiter = normalizeCsvDelimiter(options.delimiter)
  } catch {
    throw badRequest('CSV delimiter must be a single character')
  }
  const headerRow = options.headerRow ?? true
  const chunkSize = options.chunkSize ?? 500
  const parsed = csvTable(csv, headerRow, delimiter)
  if (parsed.names.length === 0) throw badRequest('CSV is empty')
  const mapping = await ensureTextColumns(db, tableId, parsed.names)
  const chunks: { chunk: number; error?: string }[] = []
  let created = 0
  const createdRows: { id: string; cells: Record<string, unknown> }[] = []
  for (let index = 0; index < parsed.records.length; index += chunkSize) {
    const slice = parsed.records.slice(index, index + chunkSize)
    const chunk = Math.floor(index / chunkSize) + 1
    try {
      const made = await db.transaction(async (tx) => {
        const rows: { id: string; cells: Record<string, unknown> }[] = []
        for (const record of slice) {
          const cells: Record<string, unknown> = {}
          mapping.forEach((column, columnIndex) => {
            const raw = record[columnIndex] ?? ''
            if (raw === '') return
            coerceImport(column, raw)
            cells[column.id] = column.type === 'select' || column.type === 'radio' ? raw : raw
          })
          const row = await createRow(tx as unknown as AppDatabase, subject, table.id, cells, {}, false)
          rows.push({ id: row.id, cells })
        }
        return rows
      })
      createdRows.push(...made)
      created += slice.length
      chunks.push({ chunk })
    } catch (error) {
      chunks.push({ chunk, error: error instanceof Error ? error.message : 'Import failed' })
    }
  }
  await publishTableSignal(db, subject.id, table.id, 'rows.changed')
  await publishTableSignal(db, subject.id, table.id, 'columns.changed')
  const duplicates = await importDuplicateWarnings(db, subject, table.id, mapping, createdRows)
  return { created, chunks, errors: chunks.filter((chunk) => chunk.error), duplicates }
}

export async function exportCsv(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  filter?: FilterNode | null,
) {
  const { shell, physical } = await resolveTableContext(db, subject, tableId, 'export')
  const columns = (
    await visibleColumns(db, subject, shell.id, shell.projectId, await loadColumns(db, physical.id))
  ).filter((column) => !column.hidden)
  const page = await queryRows(db, {
    tableId: physical.id,
    columns,
    subjectType: subject.kind,
    subjectId: subject.id,
    limit: 100,
    filter,
  })
  const all = [...page.rows]
  let cursor = page.nextCursor
  while (cursor && all.length < 5000) {
    const next = await queryRows(db, {
      tableId: physical.id,
      columns,
      subjectType: subject.kind,
      subjectId: subject.id,
      limit: 100,
      cursor,
      filter,
    })
    all.push(...next.rows)
    cursor = next.nextCursor
  }
  const cells = await cellsFor(
    db,
    all.map((row) => row.id),
  )
  const rendered = presentRows(columns, all, cells, await titleContextFor(db, physical.id, columns, cells))
  const tags = await db.select().from(tableTags).where(eq(tableTags.tableId, physical.id))
  const statuses = await db
    .select()
    .from(tableStatuses)
    .where(eq(tableStatuses.tableId, physical.id))
  const members = await db
    .select({ userId: projectMembers.userId, username: users.username })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, shell.projectId))
  const label = (column: LoadedColumn, value: unknown) => {
    if (column.type === 'tags' && Array.isArray(value))
      return value.map((id) => tags.find((tag) => tag.id === id)?.name ?? String(id)).join('|')
    if (column.type === 'status' && typeof value === 'string')
      return statuses.find((status) => status.id === value)?.name ?? value
    if (column.type === 'user' && Array.isArray(value))
      return value
        .map((id) => members.find((member) => member.userId === id)?.username ?? String(id))
        .join('|')
    return display(value)
  }
  const lines = [
    columns.map((column) => column.name),
    ...rendered.map((row) => columns.map((column) => label(column, row.cells[column.id]))),
  ]
  return { csv: toCsv(lines), rowCount: rendered.length, truncated: Boolean(cursor) }
}

function display(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
