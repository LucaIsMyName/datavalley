import { asc, eq, inArray } from 'drizzle-orm'
import { displayFormula } from '@datavalley/formula-engine'
import {
  PROJECT_TRANSFER_KIND,
  PROJECT_TRANSFER_VERSION,
  isProjectTransferDocument,
  isResourceIcon,
  projectOwnerActions,
  type FormatRule,
  type PortableCell,
  type PortableFormatRule,
  type PortableFormula,
  type PortableTable,
  type ProjectTransferDocument,
} from '@datavalley/shared'
import type { AppDatabase } from '../../database/client.js'
import {
  columnOptions,
  formulas,
  permissionGrants,
  projectMembers,
  projects,
  relationRecords,
  relations,
  tableCells,
  tableColumns,
  tableRows,
  tableStatuses,
  tableTags,
  tableViews,
  tables,
  users,
} from '../../database/schema.js'
import { parseCell, readCell, type ColumnShape } from '../../column-types/index.js'
import { AppError, badRequest, notFound } from '../../errors.js'
import { allows, assertCan, refreshRequestGrants, resolveGrants } from '../../security/access.js'
import { invalidateGrantsCache } from '../../security/grants-cache.js'
import { writeAudit } from '../../security/audit.js'
import type { Subject } from '../../security/subject.js'
import { canonicalizeFormatRules, readCellFormula, saveFormula } from '../formulas/service.js'
import { exportDocumentConfig, importDocumentConfig } from '../tables/document.js'
import { loadColumns, type LoadedColumn } from '../tables/service.js'
import { visibleColumns } from '../rows/visible-columns.js'
import { getProject } from './service.js'

const uuidInText = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

type ExportContext = {
  warnings: string[]
  tableNameById: Map<string, string>
  columnKey: Map<string, { table: string; column: string }>
  columnIdByKey: Map<string, string>
  rowRef: Map<string, { table: string; rowNumber: number }>
  tagName: Map<string, string>
  statusName: Map<string, string>
  optionLabel: Map<string, string>
  usernameById: Map<string, string>
}

function columnKey(table: string, column: string) {
  return `${table}\0${column}`
}

function remapJsonIds(value: unknown, idToName: Map<string, string>): unknown {
  if (typeof value === 'string') {
    if (idToName.has(value)) return idToName.get(value)
    return value
  }
  if (Array.isArray(value)) return value.map((item) => remapJsonIds(item, idToName))
  if (value && typeof value === 'object') {
    const record: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      record[key] = remapJsonIds(item, idToName)
    }
    return record
  }
  return value
}

function stripColumnConfig(config: Record<string, unknown>, toTable?: string) {
  const next = { ...config }
  delete next.relationId
  delete next.toTableId
  if (toTable) next.toTable = toTable
  return next
}

async function buildExportContext(db: AppDatabase, projectId: string): Promise<ExportContext> {
  const warnings: string[] = []
  const tableRows_ = await db
    .select()
    .from(tables)
    .where(eq(tables.projectId, projectId))
    .orderBy(asc(tables.position))
  const tableNameById = new Map(tableRows_.map((table) => [table.id, table.name]))
  const columnKeyMap = new Map<string, { table: string; column: string }>()
  const columnIdByKey = new Map<string, string>()
  const rowRef = new Map<string, { table: string; rowNumber: number }>()
  const tagName = new Map<string, string>()
  const statusName = new Map<string, string>()
  const optionLabel = new Map<string, string>()
  const usernameById = new Map<string, string>()

  for (const table of tableRows_) {
    const dataTableId = table.mirrorOfTableId ?? table.id
    const columns = await loadColumns(db, dataTableId)
    for (const column of columns) {
      // A mirror repeats the source columns. Keep the source table name so a quote mapping survives export.
      if (!table.mirrorOfTableId)
        columnKeyMap.set(column.id, { table: table.name, column: column.name })
      else if (!columnKeyMap.has(column.id))
        columnKeyMap.set(column.id, { table: table.name, column: column.name })
      columnIdByKey.set(columnKey(table.name, column.name), column.id)
      for (const option of column.options ?? []) optionLabel.set(option.id, option.label)
    }
    const rows = await db
      .select()
      .from(tableRows)
      .where(eq(tableRows.tableId, dataTableId))
      .orderBy(asc(tableRows.position))
    for (const row of rows) rowRef.set(row.id, { table: table.name, rowNumber: row.rowNumber })
    for (const tag of await db.select().from(tableTags).where(eq(tableTags.tableId, dataTableId))) {
      tagName.set(tag.id, tag.name)
    }
    for (const status of await db
      .select()
      .from(tableStatuses)
      .where(eq(tableStatuses.tableId, dataTableId))) {
      statusName.set(status.id, status.name)
    }
  }

  const orgUsers = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .innerJoin(projects, eq(projects.organizationId, users.organizationId))
    .where(eq(projects.id, projectId))
  for (const user of orgUsers) usernameById.set(user.id, user.username)

  return {
    warnings,
    tableNameById,
    columnKey: columnKeyMap,
    columnIdByKey,
    rowRef,
    tagName,
    statusName,
    optionLabel,
    usernameById,
  }
}

async function bracketCatalog(db: AppDatabase, projectId: string, tableId: string) {
  const projectTables = await db
    .select()
    .from(tables)
    .where(eq(tables.projectId, projectId))
    .orderBy(asc(tables.position))
  const columns: { name: string; columnId: string; tableId: string; tableName: string }[] = []
  const rows: { tableId: string; rowNumber: number; rowId: string }[] = []
  for (const item of projectTables) {
    const dataTableId = item.mirrorOfTableId ?? item.id
    for (const column of await loadColumns(db, dataTableId)) {
      columns.push({
        name: column.name,
        columnId: column.id,
        tableId: item.id,
        tableName: item.name,
      })
    }
    for (const row of await db.select().from(tableRows).where(eq(tableRows.tableId, dataTableId))) {
      rows.push({ tableId: dataTableId, rowNumber: row.rowNumber, rowId: row.id })
    }
  }
  return { tableId, columns, relations: [], rows }
}

async function portableFormatRules(
  db: AppDatabase,
  projectId: string,
  tableId: string,
  rules: unknown,
  ctx: ExportContext,
): Promise<PortableFormatRule[]> {
  if (!Array.isArray(rules)) return []
  const catalog = await bracketCatalog(db, projectId, tableId)
  const mapped: PortableFormatRule[] = []
  for (const raw of rules) {
    if (!raw || typeof raw !== 'object') continue
    const rule = raw as FormatRule
    const column = rule.columnId ? ctx.columnKey.get(rule.columnId)?.column : undefined
    let expression = rule.expression
    if (expression && uuidInText.test(expression)) {
      try {
        expression = displayFormula(expression, catalog) ?? expression
      } catch {
        /* keep canonical */
      }
    }
    mapped.push({
      id: rule.id,
      scope: rule.scope,
      column,
      operator: rule.operator,
      value: rule.value,
      valueTo: rule.valueTo,
      expression,
      style: rule.style ?? {},
    })
  }
  return mapped
}

function serializeCellValue(
  column: LoadedColumn,
  value: unknown,
  ctx: ExportContext,
  tableName: string,
) {
  if (value == null) return null
  if (column.type === 'formula' || column.type === 'lookup' || column.type === 'row_id') return null
  if (column.type === 'tags' && Array.isArray(value)) {
    return value.map((id) => ctx.tagName.get(String(id)) ?? String(id))
  }
  if (column.type === 'status' && typeof value === 'string') {
    return ctx.statusName.get(value) ?? value
  }
  if (column.type === 'user' && Array.isArray(value)) {
    return value
      .map((id) => {
        const username = ctx.usernameById.get(String(id))
        if (!username) ctx.warnings.push(`Unknown user id in ${tableName} -> ${column.name}`)
        return username ?? null
      })
      .filter((item) => item != null)
  }
  if (column.type === 'select' || column.type === 'radio' || column.type === 'multi_select') {
    const mapId = (id: string) => ctx.optionLabel.get(id) ?? id
    if (Array.isArray(value)) return value.map((id) => mapId(String(id)))
    return mapId(String(value))
  }
  if (column.type === 'relation' && typeof value === 'string') {
    const ref = ctx.rowRef.get(value)
    if (!ref) {
      ctx.warnings.push(`Missing relation target in ${tableName} -> ${column.name}`)
      return null
    }
    return { table: ref.table, rowNumber: ref.rowNumber }
  }
  if (column.type === 'media') {
    ctx.warnings.push(`Skipped media in ${tableName} -> ${column.name}`)
    return null
  }
  return value
}

export async function exportProject(
  db: AppDatabase,
  subject: Subject,
  projectId: string,
): Promise<ProjectTransferDocument> {
  if (subject.role !== 'admin') throw new AppError(403, 'forbidden', 'Admin access is required')
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!project) throw notFound()
  await assertCan(db, subject, 'view', { type: 'project', id: project.id })
  const grants = await resolveGrants(db, subject)

  const ctx = await buildExportContext(db, projectId)
  const tableRows_ = await db
    .select()
    .from(tables)
    .where(eq(tables.projectId, projectId))
    .orderBy(asc(tables.position))
  const portableTables: PortableTable[] = []
  const portableFormulas: PortableFormula[] = []

  for (const table of tableRows_) {
    if (table.mirrorOfTableId) {
      const name = ctx.tableNameById.get(table.mirrorOfTableId)
      if (name) {
        portableTables.push({
          name: table.name,
          description: table.description,
          icon: table.icon,
          position: table.position,
          headerConfig: table.headerConfig,
          footerConfig: table.footerConfig,
          documentConfig: {},
          formatRules: [],
          nextRowNumber: 1,
          locked: false,
          activity: table.activity,
          mirrorOf: name,
          columns: [],
          tags: [],
          statuses: [],
          rows: [],
          views: [],
        })
      } else {
        ctx.warnings.push(`Skipped mirror table ${table.name} with unknown source`)
      }
      continue
    }
    const dataTableId = table.id
    const columns = await visibleColumns(
      db,
      subject,
      table.id,
      projectId,
      await loadColumns(db, dataTableId),
    )
    const columnById = new Map(columns.map((column) => [column.id, column]))

    const portableColumns = await Promise.all(
      columns.map(async (column) => {
        let toTable: string | undefined
        let cardinality: string | undefined
        if (column.type === 'relation') {
          const targetId = String(column.config.toTableId ?? '')
          toTable = ctx.tableNameById.get(targetId)
          const relationId = String(column.config.relationId ?? '')
          if (relationId) {
            const [relation] = await db
              .select()
              .from(relations)
              .where(eq(relations.id, relationId))
              .limit(1)
            cardinality = relation?.cardinality
          }
        }
        const config = stripColumnConfig((column.config ?? {}) as Record<string, unknown>, toTable)
        if (cardinality) config.cardinality = cardinality
        return {
          name: column.name,
          description: column.description,
          type: column.type,
          config,
          position: column.position,
          hidden: column.hidden,
          width: column.width,
          frozen: column.frozen,
          options: (column.options ?? []).map((option) => ({
            label: option.label,
            color: option.color,
            position: option.position,
          })),
        }
      }),
    )

    const tags = await db.select().from(tableTags).where(eq(tableTags.tableId, dataTableId))
    const statuses = await db
      .select()
      .from(tableStatuses)
      .where(eq(tableStatuses.tableId, dataTableId))
    const rows = await db
      .select()
      .from(tableRows)
      .where(eq(tableRows.tableId, dataTableId))
      .orderBy(asc(tableRows.position))
    const cells = rows.length
      ? await db
          .select()
          .from(tableCells)
          .where(
            inArray(
              tableCells.rowId,
              rows.map((row) => row.id),
            ),
          )
      : []
    const cellsByRow = new Map<string, typeof cells>()
    for (const cell of cells) {
      const bucket = cellsByRow.get(cell.rowId) ?? []
      bucket.push(cell)
      cellsByRow.set(cell.rowId, bucket)
    }

    const portableRows = []
    const exportedRowIds = new Set<string>()
    for (const row of rows) {
      if (
        !allows(subject, grants, 'view', {
          type: 'row',
          id: row.id,
          parents: { table: table.id, project: projectId },
        })
      ) {
        continue
      }
      exportedRowIds.add(row.id)
      const portableCells: PortableCell[] = []
      for (const cell of cellsByRow.get(row.id) ?? []) {
        const column = columnById.get(cell.columnId)
        if (!column) continue
        const raw = readCell(column, cell)
        if (column.type === 'relation' && typeof raw === 'string') {
          const toTableId = String(column.config.toTableId ?? '')
          if (
            toTableId &&
            !allows(subject, grants, 'view', {
              type: 'row',
              id: raw,
              parents: { table: toTableId, project: projectId },
            })
          ) {
            continue
          }
        }
        const value = serializeCellValue(column, raw, ctx, table.name)
        const hasBackground = cell.background != null && cell.background !== ''
        const formatRules = await portableFormatRules(
          db,
          projectId,
          table.id,
          cell.formatRules,
          ctx,
        )
        if (value == null && !hasBackground && formatRules.length === 0) continue
        portableCells.push({
          column: column.name,
          value,
          background: cell.background,
          ...(formatRules.length ? { formatRules } : {}),
        })
      }
      portableRows.push({
        rowNumber: row.rowNumber,
        position: row.position,
        color: row.color,
        notes: row.notes,
        cells: portableCells,
      })
    }

    const idToName = new Map<string, string>()
    for (const column of columns) idToName.set(column.id, column.name)
    const views = (await db.select().from(tableViews).where(eq(tableViews.tableId, table.id)))
      .filter((view) => view.shared)
      .map((view) => ({
        name: view.name,
        definition: remapJsonIds(view.definition, idToName) as Record<string, unknown>,
      }))

    const storedFormulas = await db.select().from(formulas).where(eq(formulas.tableId, dataTableId))
    for (const formula of storedFormulas) {
      const column = columnById.get(formula.columnId ?? '')
      const row = rows.find((item) => item.id === formula.rowId)
      if (!column || !row || !exportedRowIds.has(row.id)) continue
      const { source } = await readCellFormula(
        db,
        subject,
        formula.rowId,
        formula.columnId ?? column.id,
      )
      portableFormulas.push({
        table: table.name,
        column: column.name,
        rowNumber: row.rowNumber,
        expression: source || formula.source,
      })
    }

    portableTables.push({
      name: table.name,
      description: table.description,
      icon: table.icon,
      position: table.position,
      headerConfig: table.headerConfig,
      footerConfig: table.footerConfig,
      documentConfig: exportDocumentConfig(table.documentConfig, {
        tableName: (id) => ctx.tableNameById.get(id),
        columnName: (id) => ctx.columnKey.get(id),
      }),
      formatRules: await portableFormatRules(db, projectId, table.id, table.formatRules, ctx),
      nextRowNumber: table.nextRowNumber,
      locked: table.lockedAt != null,
      activity: table.activity,
      columns: portableColumns,
      tags: tags.map((tag) => ({ name: tag.name, color: tag.color })),
      statuses: statuses.map((status) => ({
        name: status.name,
        color: status.color,
        position: status.position,
      })),
      rows: portableRows,
      views,
    })
  }

  await writeAudit(db, subject, {
    action: 'project.export',
    resourceType: 'project',
    resourceId: projectId,
  })

  return {
    kind: PROJECT_TRANSFER_KIND,
    version: PROJECT_TRANSFER_VERSION,
    exportedAt: new Date().toISOString(),
    ...(ctx.warnings.length ? { warnings: ctx.warnings } : {}),
    project: {
      name: project.name,
      description: project.description,
      icon: project.icon,
      settings: (project.settings ?? {}) as Record<string, unknown>,
    },
    tables: portableTables,
    formulas: portableFormulas,
  }
}

type ImportContext = {
  warnings: string[]
  tableIdByName: Map<string, string>
  columnIdByKey: Map<string, string>
  columns: Map<string, LoadedColumn>
  rowIdByRef: Map<string, string>
  tagIdByKey: Map<string, string>
  statusIdByKey: Map<string, string>
  optionIdByKey: Map<string, string>
  usernameToId: Map<string, string>
}

function activityFlag(portable: { activity?: boolean; name: string }) {
  if (portable.activity === true) return true
  if (portable.activity === false) return false
  const name = portable.name.trim().toLowerCase()
  return name === 'tasks' || name === 'meetings'
}

function rowRefKey(table: string, rowNumber: number) {
  return `${table}\0${rowNumber}`
}

async function importFormatRules(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  rules: PortableFormatRule[],
  columnNameToId: Map<string, string>,
) {
  if (rules.length === 0) return []
  const withIds = rules.map((rule) => ({
    ...rule,
    columnId: rule.column ? columnNameToId.get(rule.column) : undefined,
  }))
  return canonicalizeFormatRules(db, subject, tableId, withIds)
}

function resolvePortableConfig(
  config: Record<string, unknown>,
  tableIdByName: Map<string, string>,
) {
  const next = { ...config }
  const toTable = typeof next.toTable === 'string' ? next.toTable : undefined
  delete next.toTable
  if (toTable) {
    const id = tableIdByName.get(toTable)
    if (id) next.toTableId = id
  }
  return next
}

export async function importProject(
  db: AppDatabase,
  subject: Subject,
  body: unknown,
  nameOverride?: string,
) {
  if (subject.role !== 'admin') throw new AppError(403, 'forbidden', 'Admin access is required')
  if (!subject.user) throw notFound()

  const doc = normalizeImportBody(body, nameOverride)
  if (!isProjectTransferDocument(doc)) throw badRequest('Invalid project transfer document')

  const warnings: string[] = [...(doc.warnings ?? [])]
  const projectName = (nameOverride ?? doc.project.name).trim()
  if (!projectName) throw badRequest('Project name is required')
  if (!isResourceIcon(doc.project.icon)) throw badRequest('Invalid project icon')

  const orgUsers = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.organizationId, subject.user.organizationId))
  const usernameToId = new Map(orgUsers.map((user) => [user.username.toLowerCase(), user.id]))

  return db.transaction(async (tx) => {
    const database = tx
    const [project] = await tx
      .insert(projects)
      .values({
        organizationId: subject.user!.organizationId,
        name: projectName,
        description: doc.project.description ?? '',
        icon: doc.project.icon,
        settings: (doc.project.settings ?? {}) as never,
        createdBy: subject.id,
      })
      .returning()
    await tx.insert(projectMembers).values({ projectId: project.id, userId: subject.id })
    await tx.insert(permissionGrants).values(
      projectOwnerActions.map((action) => ({
        subjectType: subject.kind,
        subjectId: subject.id,
        resourceType: 'project' as const,
        resourceId: project.id,
        action,
        effect: 'allow' as const,
      })),
    )
    await refreshRequestGrants(database, subject)

    const ctx: ImportContext = {
      warnings,
      tableIdByName: new Map(),
      columnIdByKey: new Map(),
      columns: new Map(),
      rowIdByRef: new Map(),
      tagIdByKey: new Map(),
      statusIdByKey: new Map(),
      optionIdByKey: new Map(),
      usernameToId,
    }

    const tableNameSet = new Set(doc.tables.map((table) => table.name))
    if (tableNameSet.size !== doc.tables.length)
      throw badRequest('Duplicate table names in import file')

    for (const portable of doc.tables) {
      if (portable.mirrorOf && !tableNameSet.has(portable.mirrorOf)) {
        warnings.push(
          `Ignored mirror for ${portable.name}: unknown source table ${portable.mirrorOf}`,
        )
      }
      const [created] = await tx
        .insert(tables)
        .values({
          projectId: project.id,
          name: portable.name,
          description: portable.description ?? '',
          icon: isResourceIcon(portable.icon) ? portable.icon : 'Table',
          position: portable.position,
          headerConfig: portable.headerConfig as never,
          footerConfig: portable.footerConfig as never,
          formatRules: [] as never,
          nextRowNumber: portable.nextRowNumber,
          lockedAt: portable.locked ? new Date() : null,
          activity: activityFlag(portable),
          createdBy: subject.id,
        })
        .returning()
      ctx.tableIdByName.set(portable.name, created.id)
    }

    const mirrorUpdates: { tableId: string; mirrorName: string }[] = []
    for (const portable of doc.tables) {
      if (!portable.mirrorOf) continue
      const tableId = ctx.tableIdByName.get(portable.name)
      if (!tableId) continue
      mirrorUpdates.push({ tableId, mirrorName: portable.mirrorOf })
    }

    const deferredRelations: {
      tableName: string
      columnName: string
      toTable: string
      cardinality: string
    }[] = []

    for (const portable of doc.tables) {
      const tableId = ctx.tableIdByName.get(portable.name)
      if (!tableId) continue
      if (portable.mirrorOf) continue
      const columnNameToId = new Map<string, string>()
      for (const column of portable.columns) {
        const config = resolvePortableConfig(column.config ?? {}, ctx.tableIdByName)
        const [created] = await tx
          .insert(tableColumns)
          .values({
            tableId,
            name: column.name,
            description: column.description ?? '',
            type: column.type,
            config,
            position: column.position,
            hidden: column.hidden,
            width: column.width,
            frozen: column.frozen,
          })
          .returning()
        const key = columnKey(portable.name, column.name)
        ctx.columnIdByKey.set(key, created.id)
        columnNameToId.set(column.name, created.id)
        const loaded: LoadedColumn = {
          id: created.id,
          tableId,
          name: created.name,
          type: created.type,
          config: (created.config ?? {}) as Record<string, unknown>,
          description: created.description,
          position: created.position,
          hidden: created.hidden,
          width: created.width,
          frozen: created.frozen,
          options: (column.options ?? []).map((option, index) => ({
            id: `${created.id}-opt-${index}`,
            label: option.label,
            color: option.color,
            position: option.position,
          })),
        }
        ctx.columns.set(created.id, loaded)
        for (const option of column.options ?? []) {
          const [row] = await tx
            .insert(columnOptions)
            .values({
              columnId: created.id,
              label: option.label,
              color: option.color,
              position: option.position,
            })
            .returning()
          ctx.optionIdByKey.set(`${portable.name}\0${column.name}\0${option.label}`, row.id)
        }
        if (column.type === 'relation') {
          const toTable = String(column.config.toTable ?? '')
          const cardinality = String(column.config.cardinality ?? 'many_to_one')
          if (toTable)
            deferredRelations.push({
              tableName: portable.name,
              columnName: column.name,
              toTable,
              cardinality,
            })
        }
      }

      for (const tag of portable.tags) {
        const [row] = await tx
          .insert(tableTags)
          .values({ tableId, name: tag.name, color: tag.color })
          .returning()
        ctx.tagIdByKey.set(`${portable.name}\0${tag.name.toLowerCase()}`, row.id)
      }
      for (const status of portable.statuses) {
        const [row] = await tx
          .insert(tableStatuses)
          .values({ tableId, name: status.name, color: status.color, position: status.position })
          .returning()
        ctx.statusIdByKey.set(`${portable.name}\0${status.name.toLowerCase()}`, row.id)
      }

      const formatRules = await importFormatRules(
        database,
        subject,
        tableId,
        portable.formatRules ?? [],
        columnNameToId,
      )
      await tx
        .update(tables)
        .set({ formatRules: formatRules as never })
        .where(eq(tables.id, tableId))

      for (const portableRow of portable.rows) {
        const [row] = await tx
          .insert(tableRows)
          .values({
            tableId,
            position: portableRow.position,
            color: portableRow.color,
            notes: portableRow.notes ?? '',
            rowNumber: portableRow.rowNumber,
            createdBy: subject.id,
          })
          .returning()
        ctx.rowIdByRef.set(rowRefKey(portable.name, portableRow.rowNumber), row.id)

        for (const portableCell of portableRow.cells) {
          const columnId = columnNameToId.get(portableCell.column)
          if (!columnId) continue
          const column = ctx.columns.get(columnId)
          if (!column) continue
          if (column.type === 'formula' || column.type === 'lookup') continue
          const parsed = deserializeCell(database, column, portableCell, portable.name, ctx)
          if (!parsed && !portableCell.background && !portableCell.formatRules?.length) continue
          const rules = portableCell.formatRules?.length
            ? await importFormatRules(
                database,
                subject,
                tableId,
                portableCell.formatRules,
                columnNameToId,
              )
            : []
          const base = parsed ?? {
            valueText: null,
            valueNumber: null,
            valueBool: null,
            valueTimestamptz: null,
            valueJsonb: null,
          }
          await tx.insert(tableCells).values({
            tableId,
            rowId: row.id,
            columnId,
            valueText: base.valueText,
            valueNumber: base.valueNumber,
            valueBool: base.valueBool,
            valueTimestamptz: base.valueTimestamptz,
            valueJsonb: base.valueJsonb as never,
            background: portableCell.background ?? null,
            formatRules: rules as never,
          })
        }
      }

      for (const view of portable.views ?? []) {
        await tx.insert(tableViews).values({
          tableId,
          name: view.name,
          shared: true,
          ownerId: subject.id,
          definition: remapJsonIds(view.definition, columnNameToId) as never,
        })
      }
    }

    for (const portable of doc.tables) {
      if (portable.mirrorOf) continue
      const tableId = ctx.tableIdByName.get(portable.name)
      if (!tableId) continue
      const documentConfig = importDocumentConfig(portable.documentConfig, {
        tableId: (name) => ctx.tableIdByName.get(name),
        columnId: (table, column) => ctx.columnIdByKey.get(columnKey(table, column)),
      })
      if (Object.keys(documentConfig).length === 0) continue
      await tx
        .update(tables)
        .set({ documentConfig: documentConfig as never })
        .where(eq(tables.id, tableId))
    }

    for (const item of mirrorUpdates) {
      const mirrorId = ctx.tableIdByName.get(item.mirrorName)
      if (!mirrorId) continue
      await tx.update(tables).set({ mirrorOfTableId: mirrorId }).where(eq(tables.id, item.tableId))
    }

    for (const item of deferredRelations) {
      const fromTableId = ctx.tableIdByName.get(item.tableName)
      const toTableId = ctx.tableIdByName.get(item.toTable)
      const columnId = ctx.columnIdByKey.get(columnKey(item.tableName, item.columnName))
      if (!fromTableId || !toTableId || !columnId) {
        warnings.push(`Skipped relation column ${item.tableName} -> ${item.columnName}`)
        continue
      }
      const [relation] = await tx
        .insert(relations)
        .values({
          fromTableId,
          toTableId,
          fromColumnId: columnId,
          cardinality: item.cardinality,
          onDelete: 'restrict',
        })
        .returning()
      await tx
        .update(tableColumns)
        .set({ config: { relationId: relation.id, toTableId } as never })
        .where(eq(tableColumns.id, columnId))
      const column = ctx.columns.get(columnId)
      if (column) column.config = { relationId: relation.id, toTableId }
    }

    for (const portable of doc.tables) {
      if (portable.mirrorOf) continue
      const tableId = ctx.tableIdByName.get(portable.name)
      if (!tableId) continue
      for (const portableRow of portable.rows) {
        for (const portableCell of portableRow.cells) {
          const columnId = ctx.columnIdByKey.get(columnKey(portable.name, portableCell.column))
          const column = columnId ? ctx.columns.get(columnId) : undefined
          if (!column || column.type !== 'relation') continue
          const rowId = ctx.rowIdByRef.get(rowRefKey(portable.name, portableRow.rowNumber))
          if (!rowId) continue
          const parsed = deserializeCell(database, column, portableCell, portable.name, ctx)
          if (!parsed?.valueJsonb) continue
          const relationId = String(column.config.relationId ?? '')
          const targetId = (parsed.valueJsonb as { rowId?: string }).rowId
          if (!relationId || !targetId) continue
          await tx
            .insert(relationRecords)
            .values({ relationId, fromRowId: rowId, toRowId: targetId })
            .onConflictDoNothing()
        }
      }
    }

    for (const item of doc.formulas) {
      const portableTable = doc.tables.find((table) => table.name === item.table)
      if (portableTable?.mirrorOf) continue
      const columnId = ctx.columnIdByKey.get(columnKey(item.table, item.column))
      const rowId = ctx.rowIdByRef.get(rowRefKey(item.table, item.rowNumber))
      if (!columnId || !rowId)
        throw badRequest(
          `Missing formula target ${item.table} -> ${item.column} #${item.rowNumber}`,
        )
      await saveFormula(database, subject, columnId, item.expression, rowId, false)
    }

    await writeAudit(database, subject, {
      action: 'project.import',
      resourceType: 'project',
      resourceId: project.id,
      metadata: { name: projectName, tableCount: doc.tables.length },
    })
    invalidateGrantsCache(subject)
    const imported = await getProject(database, subject, project.id)
    return { project: imported, warnings }
  })
}

function normalizeImportBody(body: unknown, nameOverride?: string): ProjectTransferDocument {
  if (!body || typeof body !== 'object') throw badRequest('Invalid import body')
  const record = body as Record<string, unknown>
  if (record.document && typeof record.document === 'object') {
    const document = record.document as ProjectTransferDocument
    if (typeof record.name === 'string' && record.name.trim()) {
      return { ...document, project: { ...document.project, name: record.name.trim() } }
    }
    return document
  }
  if (nameOverride?.trim()) {
    const doc = body as ProjectTransferDocument
    return { ...doc, project: { ...doc.project, name: nameOverride.trim() } }
  }
  return body as ProjectTransferDocument
}

function deserializeCell(
  _db: AppDatabase,
  column: LoadedColumn,
  portable: PortableCell,
  tableName: string,
  ctx: ImportContext,
) {
  const value = portable.value
  if (value == null) return null
  try {
    if (column.type === 'tags' && Array.isArray(value)) {
      const tagIds = value
        .map((name) => ctx.tagIdByKey.get(`${tableName}\0${String(name).toLowerCase()}`))
        .filter((id): id is string => Boolean(id))
      return parseCell(column, tagIds)
    }
    if (column.type === 'status') {
      const id = ctx.statusIdByKey.get(`${tableName}\0${String(value).toLowerCase()}`)
      if (!id) return null
      return parseCell(column, id)
    }
    if (column.type === 'user' && Array.isArray(value)) {
      const userIds = value
        .map((name) => ctx.usernameToId.get(String(name).toLowerCase()) ?? null)
        .filter((id): id is string => Boolean(id))
      if (userIds.length !== value.length) {
        ctx.warnings.push(`Some users were missing in ${tableName} -> ${column.name}`)
      }
      return parseCell(column, userIds)
    }
    if (column.type === 'select' || column.type === 'radio' || column.type === 'multi_select') {
      if (Array.isArray(value)) {
        const labels = value.map(
          (label) => ctx.optionIdByKey.get(`${tableName}\0${column.name}\0${label}`) ?? label,
        )
        return parseCell(column, labels)
      }
      const label = ctx.optionIdByKey.get(`${tableName}\0${column.name}\0${value}`) ?? value
      return parseCell(column, label)
    }
    if (column.type === 'relation' && value && typeof value === 'object') {
      const ref = value as { table?: string; rowNumber?: number }
      if (!ref.table || ref.rowNumber == null) return null
      const targetRowId = ctx.rowIdByRef.get(rowRefKey(ref.table, ref.rowNumber))
      if (!targetRowId) {
        ctx.warnings.push(`Missing relation row ${ref.table} #${ref.rowNumber}`)
        return null
      }
      return parseCell(column, targetRowId)
    }
    if (column.type === 'media') return null
    return parseCell(column as ColumnShape, value)
  } catch {
    ctx.warnings.push(`Skipped invalid cell ${tableName} -> ${column.name}`)
    return null
  }
}
