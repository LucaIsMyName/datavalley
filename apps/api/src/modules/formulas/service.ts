import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import {
  canonicalize,
  collectRefs,
  parseFormula,
  runFormula,
  type AstNode,
  type FormulaValue,
  type RefNode,
} from '@datavalley/formula-engine'
import type { AppDatabase } from '../../database/client.js'
import {
  formulaCache,
  formulaDependencies,
  formulas,
  projects,
  relationRecords,
  relations,
  tableCells,
  tableColumns,
  tableRows,
  tableStatuses,
  tableTags,
  tables,
  users,
} from '../../database/schema.js'
import { readCell } from '../../column-types/index.js'
import { badRequest } from '../../errors.js'
import { allows, loadGrants } from '../../security/access.js'
import { sha256 } from '../../security/crypto.js'
import type { Subject } from '../../security/subject.js'
import { loadColumns, requireTable, type LoadedColumn } from '../tables/service.js'

const textTypes = new Set(['text', 'long_text', 'mail', 'url', 'date', 'datetime'])

function bindCellNames(expression: string, names: Record<string, RefNode>) {
  const bound = { ...names }
  const pattern = /([A-Za-z_][A-Za-z0-9_.]*)@([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/g
  for (const match of expression.matchAll(pattern)) {
    const base = names[match[1]]
    if (base) bound[match[0]] = { ...base, rowId: match[2] }
  }
  return bound
}

async function namesFor(db: AppDatabase, subject: Subject, tableId: string, expression = '') {
  const table = await requireTable(db, subject, tableId, 'view')
  const grants = await loadGrants(db, subject)
  const names: Record<string, RefNode> = {}
  const elsewhere = new Map<string, { ref: RefNode; count: number }>()
  const projectTables = await db.select().from(tables).where(eq(tables.projectId, table.projectId))
  for (const item of projectTables) {
    if (!allows(subject, grants, 'view', { type: 'table', id: item.id, parents: { project: item.projectId } })) continue
    const columns = await loadColumns(db, item.id)
    for (const column of columns) {
      if (item.id === tableId) names[column.name] = { columnId: column.id }
      else {
        const seen = elsewhere.get(column.name)
        if (seen) seen.count += 1
        else elsewhere.set(column.name, { ref: { tableId: item.id, columnId: column.id }, count: 1 })
      }
      names[`${item.name}.${column.name}`] = { tableId: item.id, columnId: column.id }
    }
  }
  for (const [name, seen] of elsewhere) {
    if (seen.count === 1 && !names[name]) names[name] = seen.ref
  }
  return { table, names: bindCellNames(expression, names), grants }
}

function sameValue(left: FormulaValue, right: FormulaValue) {
  if (left == null && right == null) return true
  return left === right
}

class ValueMap {
  private columns = new Map<string, LoadedColumn | null>()
  private tagNames = new Map<string, Map<string, string>>()
  private statusNames = new Map<string, Map<string, string>>()
  private userNames = new Map<string, string>()
  private titles = new Map<string, string | null>()
  private series = new Map<string, FormulaValue[]>()

  constructor(
    private db: AppDatabase,
    private subject: Subject,
    private stack: Set<string>,
  ) {}

  async column(columnId: string) {
    if (this.columns.has(columnId)) return this.columns.get(columnId) ?? null
    const [row] = await this.db.select().from(tableColumns).where(eq(tableColumns.id, columnId)).limit(1)
    if (!row) {
      this.columns.set(columnId, null)
      return null
    }
    const columns = await loadColumns(this.db, row.tableId)
    const loaded = columns.find((item) => item.id === columnId) ?? null
    this.columns.set(columnId, loaded)
    return loaded
  }

  async label(column: LoadedColumn, id: string) {
    const option = column.options?.find((item) => item.id === id)
    if (option) return option.label
    if (column.type === 'tags') {
      const names = await this.tagMap(column.tableId)
      return names.get(id) ?? id
    }
    if (column.type === 'status') {
      const names = await this.statusMap(column.tableId)
      return names.get(id) ?? id
    }
    if (column.type === 'user') {
      if (!this.userNames.has(id)) {
        const [user] = await this.db.select().from(users).where(eq(users.id, id)).limit(1)
        this.userNames.set(id, user?.username ?? id)
      }
      return this.userNames.get(id) ?? id
    }
    return id
  }

  private async tagMap(tableId: string) {
    const cached = this.tagNames.get(tableId)
    if (cached) return cached
    const rows = await this.db.select().from(tableTags).where(eq(tableTags.tableId, tableId))
    const names = new Map(rows.map((row) => [row.id, row.name]))
    this.tagNames.set(tableId, names)
    return names
  }

  private async statusMap(tableId: string) {
    const cached = this.statusNames.get(tableId)
    if (cached) return cached
    const rows = await this.db.select().from(tableStatuses).where(eq(tableStatuses.tableId, tableId))
    const names = new Map(rows.map((row) => [row.id, row.name]))
    this.statusNames.set(tableId, names)
    return names
  }

  async rowTitle(rowId: string) {
    if (this.titles.has(rowId)) return this.titles.get(rowId) ?? null
    const [row] = await this.db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
    if (!row) {
      this.titles.set(rowId, null)
      return null
    }
    const columns = await loadColumns(this.db, row.tableId)
    const title = columns.find((column) => textTypes.has(column.type) && column.type !== 'date' && column.type !== 'datetime')
    let label = String(row.rowNumber || row.id)
    if (title) {
      const [cell] = await this.db
        .select()
        .from(tableCells)
        .where(and(eq(tableCells.columnId, title.id), eq(tableCells.rowId, rowId)))
        .limit(1)
      const value = readCell(title, cell)
      if (typeof value === 'string' && value) label = value
    }
    this.titles.set(rowId, label)
    return label
  }

  async present(column: LoadedColumn, raw: unknown): Promise<FormulaValue> {
    if (column.type === 'media') return null
    if (raw == null || raw === '') return null
    if (column.type === 'number' || column.type === 'currency') return typeof raw === 'number' ? raw : null
    if (column.type === 'checkbox') return raw === true
    if (column.type === 'tags' || column.type === 'multi_select' || column.type === 'user') {
      const ids = Array.isArray(raw) ? raw.map(String) : []
      const names: string[] = []
      for (const id of ids) names.push(await this.label(column, id))
      return names
    }
    if (column.type === 'status' || column.type === 'select' || column.type === 'radio') return this.label(column, String(raw))
    if (column.type === 'relation') return this.rowTitle(String(raw))
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return raw
    return null
  }

  async cell(column: LoadedColumn, rowId: string): Promise<FormulaValue> {
    if (!(await canReadColumn(this.db, this.subject, column.id))) return { error: '#REF' }
    if (column.type === 'row_id') {
      const [row] = await this.db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
      if (!row) return null
      return column.config.style === 'uuid' ? row.id : String(row.rowNumber ?? '')
    }
    if (column.type === 'formula') {
      const [formula] = await this.db
        .select()
        .from(formulas)
        .where(and(eq(formulas.columnId, column.id), eq(formulas.rowId, rowId)))
        .limit(1)
      if (!formula) return null
      return evaluateStored(this.db, this.subject, formula.id, rowId, this.stack)
    }
    const [cell] = await this.db
      .select()
      .from(tableCells)
      .where(and(eq(tableCells.columnId, column.id), eq(tableCells.rowId, rowId)))
      .limit(1)
    return this.present(column, readCell(column, cell))
  }

  async columnSeries(column: LoadedColumn): Promise<FormulaValue[]> {
    const cached = this.series.get(column.id)
    if (cached) return cached
    if (!(await canReadColumn(this.db, this.subject, column.id))) return [{ error: '#REF' }]
    const rows = await this.db.select().from(tableRows).where(eq(tableRows.tableId, column.tableId)).orderBy(asc(tableRows.position))
    const values: FormulaValue[] = []
    for (const row of rows) values.push(await this.cell(column, row.id))
    this.series.set(column.id, values)
    return values
  }
}

export async function saveFormula(db: AppDatabase, subject: Subject, columnId: string, expression: string, rowId?: string) {
  const [column] = await db.select().from(tableColumns).where(eq(tableColumns.id, columnId)).limit(1)
  if (!column) throw badRequest('Unknown column')
  await requireTable(db, subject, column.tableId, 'edit')
  if (!expression.trim()) {
    if (rowId) await db.delete(formulas).where(and(eq(formulas.columnId, column.id), eq(formulas.rowId, rowId)))
    else await db.delete(formulas).where(eq(formulas.columnId, column.id))
    return { id: null, canonical: '', cycle: false }
  }
  const { names } = await namesFor(db, subject, column.tableId, expression)
  let canonical: string
  try {
    canonical = canonicalize(expression, names)
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'Invalid formula')
  }
  const ast = parseFormula(canonical)
  const refs = collectRefs(ast)
  const crosses = refs.some((ref) => ref.tableId && ref.tableId !== column.tableId)
  const rows = rowId
    ? await db.select().from(tableRows).where(and(eq(tableRows.id, rowId), eq(tableRows.tableId, column.tableId))).limit(1)
    : await db.select().from(tableRows).where(eq(tableRows.tableId, column.tableId)).orderBy(asc(tableRows.position))
  if (rowId && rows.length === 0) throw badRequest('Unknown row')
  let first: { id: string; cycle: boolean } | null = null
  for (const row of rows) {
    const cycle = await hasCycle(db, column.id, row.id, refs)
    await db.delete(formulas).where(and(eq(formulas.columnId, column.id), eq(formulas.rowId, row.id)))
    const [formula] = await db
      .insert(formulas)
      .values({
        tableId: column.tableId,
        columnId: column.id,
        rowId: row.id,
        source: expression,
        canonical,
        ast: { ...ast, cycle } as never,
        crossesTables: crosses,
      })
      .returning()
    if (refs.length) {
      await db.insert(formulaDependencies).values(
        refs.map((ref) => ({ formulaId: formula.id, tableId: ref.tableId ?? column.tableId, columnId: ref.columnId, rowId: ref.rowId ?? null })),
      )
    }
    first ??= { id: formula.id, cycle }
  }
  return { id: first?.id ?? null, canonical, cycle: first?.cycle ?? false }
}

export async function readCellFormula(db: AppDatabase, subject: Subject, rowId: string, columnId: string) {
  const [column] = await db.select().from(tableColumns).where(eq(tableColumns.id, columnId)).limit(1)
  if (!column) throw badRequest('Unknown column')
  await requireTable(db, subject, column.tableId, 'view')
  const [formula] = await db
    .select()
    .from(formulas)
    .where(and(eq(formulas.columnId, columnId), eq(formulas.rowId, rowId)))
    .limit(1)
  return { source: formula?.source ?? '' }
}

async function hasCycle(db: AppDatabase, columnId: string, rowId: string, refs: RefNode[]) {
  const self = `${columnId}:${rowId}`
  if (refs.some((ref) => ref.columnId === columnId && (!ref.rowId || ref.rowId === rowId))) return true
  const next = refs.map((ref) => `${ref.columnId}:${ref.rowId ?? rowId}`)
  const columnIds = [columnId, ...refs.map((ref) => ref.columnId)]
  const existing = columnIds.length ? await db.select().from(formulas).where(inArray(formulas.columnId, columnIds)) : []
  const graph = new Map<string, string[]>()
  for (const formula of existing) {
    if (!formula.columnId || formula.columnId === columnId && formula.rowId === rowId) continue
    const deps = await db.select().from(formulaDependencies).where(eq(formulaDependencies.formulaId, formula.id))
    graph.set(
      `${formula.columnId}:${formula.rowId}`,
      deps.filter((dep) => dep.columnId).map((dep) => `${dep.columnId}:${dep.rowId ?? formula.rowId}`),
    )
  }
  graph.set(self, next)
  const seen = new Set<string>()
  const stack = [...next]
  while (stack.length) {
    const current = stack.pop()!
    if (current === self) return true
    if (seen.has(current)) continue
    seen.add(current)
    stack.push(...(graph.get(current) ?? []))
  }
  return false
}

async function canReadColumn(db: AppDatabase, subject: Subject, columnId: string) {
  const [column] = await db.select().from(tableColumns).where(eq(tableColumns.id, columnId)).limit(1)
  if (!column) return false
  const [table] = await db.select().from(tables).where(eq(tables.id, column.tableId)).limit(1)
  if (!table) return false
  const grants = await loadGrants(db, subject)
  return allows(subject, grants, 'view', { type: 'column', id: column.id, parents: { table: table.id, project: table.projectId } })
    && allows(subject, grants, 'view', { type: 'table', id: table.id, parents: { project: table.projectId } })
}

function refKey(ref: RefNode, rowId: string) {
  if (ref.tableId && !ref.rowId) return `${ref.tableId}|${ref.columnId}|*`
  return `${ref.tableId ?? ''}|${ref.columnId}|${ref.rowId ?? rowId}`
}

async function preload(db: AppDatabase, subject: Subject, ast: AstNode, rowId: string, stack: Set<string>) {
  const values = new Map<string, FormulaValue>()
  const map = new ValueMap(db, subject, stack)
  for (const ref of collectRefs(ast)) {
    const key = refKey(ref, rowId)
    if (values.has(key)) continue
    const column = await map.column(ref.columnId)
    if (!column) {
      values.set(key, { error: '#REF' })
      continue
    }
    if (ref.tableId && !ref.rowId) {
      values.set(key, await map.columnSeries(column))
      continue
    }
    values.set(key, await map.cell(column, ref.rowId ?? rowId))
  }
  return values
}

function callsNamed(node: AstNode, name: string, into: Extract<AstNode, { type: 'call' }>[] = []) {
  if (node.type === 'call') {
    if (node.name === name) into.push(node)
    node.args.forEach((arg) => callsNamed(arg, name, into))
  } else if (node.type === 'unary') callsNamed(node.expr, name, into)
  else if (node.type === 'binary') {
    callsNamed(node.left, name, into)
    callsNamed(node.right, name, into)
  }
  return into
}

function isRefError(value: FormulaValue) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'error' in value
}

export async function evaluateAst(db: AppDatabase, subject: Subject, ast: AstNode, rowId: string, stack = new Set<string>()) {
  if ((ast as { cycle?: boolean }).cycle) return { error: '#CYCLE' as const }
  const values = await preload(db, subject, ast, rowId, stack)
  const map = new ValueMap(db, subject, stack)
  const series = new Map<string, FormulaValue[]>()
  for (const call of callsNamed(ast, 'LOOKUP')) {
    for (const arg of [call.args[0], call.args[2]]) {
      if (!arg || arg.type !== 'ref' || !arg.ref.tableId) continue
      const column = await map.column(arg.ref.columnId)
      if (!column) continue
      series.set(arg.ref.columnId, await map.columnSeries(column))
    }
  }
  const criteria = new Map<string, FormulaValue[]>()
  for (const call of [...callsNamed(ast, 'COUNTIF'), ...callsNamed(ast, 'SUMIF')]) {
    const indexes = call.name === 'SUMIF' ? [0, 2] : [0]
    for (const index of indexes) {
      const arg = call.args[index]
      if (!arg || arg.type !== 'ref' || criteria.has(arg.ref.columnId)) continue
      const column = await map.column(arg.ref.columnId)
      if (!column) continue
      criteria.set(arg.ref.columnId, await map.columnSeries(column))
    }
  }
  const related = new Map<string, FormulaValue>()
  for (const call of callsNamed(ast, 'RELATION')) {
    const fromArg = call.args[0]
    const toArg = call.args[1]
    if (!fromArg || fromArg.type !== 'ref' || !toArg || toArg.type !== 'ref') continue
    const from = await map.column(fromArg.ref.columnId)
    const to = await map.column(toArg.ref.columnId)
    const key = `${fromArg.ref.columnId}:${toArg.ref.columnId}`
    if (!from || from.type !== 'relation' || !to) {
      related.set(key, { error: '#VALUE' })
      continue
    }
    const relationId = String(from.config.relationId ?? '')
    if (!relationId) {
      related.set(key, null)
      continue
    }
    const links = await db
      .select()
      .from(relationRecords)
      .where(and(eq(relationRecords.relationId, relationId), eq(relationRecords.fromRowId, rowId)))
    if (links.length === 0) {
      related.set(key, null)
      continue
    }
    const linked: FormulaValue[] = []
    for (const link of links) linked.push(await map.cell(to, link.toRowId))
    related.set(key, linked.some(isRefError) ? { error: '#REF' } : linked.length === 1 ? linked[0] : linked)
  }
  return runFormula(ast, {
    clock: () => new Date(),
    range: () => [{ error: '#REF' }],
    lookup: (tableId, matchColumnId, needle, resultColumnId) => {
      const criteria = series.get(matchColumnId)
      const amounts = series.get(resultColumnId)
      if (!criteria || !amounts || criteria.some(isRefError)) return { error: '#REF' }
      const index = criteria.findIndex((item) => sameValue(item, needle))
      if (index < 0) return { error: '#N/A' }
      return amounts[index] ?? null
    },
    relation: (fromColumnId, toColumnId) => related.get(`${fromColumnId}:${toColumnId}`) ?? { error: '#N/A' },
    column: (ref) => criteria.get(ref.columnId) ?? { error: '#REF' },
    get: (ref) => values.get(refKey(ref, rowId)) ?? { error: '#REF' },
  })
}

async function dependencyStamp(db: AppDatabase, rowId: string, ast: AstNode) {
  const refs = collectRefs(ast)
  const rowIds = new Set<string>([rowId])
  const tableIds = new Set<string>()
  for (const ref of refs) {
    if (ref.rowId) rowIds.add(ref.rowId)
    else if (ref.tableId) tableIds.add(ref.tableId)
  }
  const rows = await db.select().from(tableRows).where(inArray(tableRows.id, [...rowIds]))
  const rowStamp = rows.map((row) => `${row.id}:${row.version}`).sort().join(',')
  const tablesStamp: string[] = []
  for (const tableId of tableIds) {
    const [latest] = await db.select().from(tableRows).where(eq(tableRows.tableId, tableId)).orderBy(desc(tableRows.version)).limit(1)
    tablesStamp.push(`${tableId}:${latest?.version ?? 0}`)
  }
  return `${rowStamp}|${tablesStamp.sort().join(',')}`
}

export async function evaluateStored(db: AppDatabase, subject: Subject, formulaId: string, rowId: string, stack = new Set<string>()) {
  if (stack.has(formulaId)) return { error: '#CYCLE' as const }
  const [formula] = await db.select().from(formulas).where(eq(formulas.id, formulaId)).limit(1)
  if (!formula) throw badRequest('Unknown formula')
  stack.add(formulaId)
  const grants = await loadGrants(db, subject)
  const permissionHash = formula.crossesTables ? sha256(JSON.stringify(grants)) : ''
  const stamp = await dependencyStamp(db, rowId, formula.ast as AstNode)
  const versionHash = `${stamp}:${formula.updatedAt.toISOString()}`
  const [cached] = await db
    .select()
    .from(formulaCache)
    .where(and(eq(formulaCache.formulaId, formula.id), eq(formulaCache.rowId, rowId), eq(formulaCache.permissionHash, permissionHash)))
  if (cached && cached.versionHash === versionHash) {
    stack.delete(formulaId)
    return cached.result as FormulaValue
  }
  const resolved = await evaluateAst(db, subject, formula.ast as AstNode, rowId, stack)
  await db
    .insert(formulaCache)
    .values({ formulaId: formula.id, rowId, permissionHash, versionHash, result: resolved as never })
    .onConflictDoUpdate({
      target: [formulaCache.formulaId, formulaCache.rowId, formulaCache.permissionHash],
      set: { versionHash, result: resolved as never },
    })
  stack.delete(formulaId)
  return resolved
}

export async function previewFormula(db: AppDatabase, subject: Subject, tableId: string, expression: string, rowId?: string) {
  const { names } = await namesFor(db, subject, tableId, expression)
  let canonical: string
  try {
    canonical = canonicalize(expression, names)
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'Invalid formula')
  }
  const value = await evaluateAst(db, subject, parseFormula(canonical), rowId ?? '')
  return { canonical, value }
}

export async function formulaDependenciesFor(db: AppDatabase, subject: Subject, formulaId: string) {
  const [formula] = await db.select().from(formulas).where(eq(formulas.id, formulaId)).limit(1)
  if (!formula) throw badRequest('Unknown formula')
  await requireTable(db, subject, formula.tableId, 'view')
  const deps = await db.select().from(formulaDependencies).where(eq(formulaDependencies.formulaId, formulaId))
  return deps.map((dep) => ({ tableId: dep.tableId, columnId: dep.columnId, rowId: dep.rowId }))
}

export async function formulaCatalog(db: AppDatabase, subject: Subject, tableId: string) {
  const table = await requireTable(db, subject, tableId, 'view')
  const grants = await loadGrants(db, subject)
  const [project] = await db.select().from(projects).where(eq(projects.id, table.projectId)).limit(1)
  const columns: { tableId: string; tableName: string; columnId: string; columnName: string; projectName: string }[] = []
  const projectTables = await db.select().from(tables).where(eq(tables.projectId, table.projectId))
  for (const item of projectTables) {
    if (!allows(subject, grants, 'view', { type: 'table', id: item.id, parents: { project: item.projectId } })) continue
    for (const column of await loadColumns(db, item.id)) {
      columns.push({
        tableId: item.id,
        tableName: item.name,
        columnId: column.id,
        columnName: column.name,
        projectName: project?.name ?? '',
      })
    }
  }
  const relationColumns = (await loadColumns(db, table.id)).filter((column) => column.type === 'relation')
  const links = []
  for (const column of relationColumns) {
    const relationId = String(column.config.relationId ?? '')
    const [relation] = relationId ? await db.select().from(relations).where(eq(relations.id, relationId)).limit(1) : []
    if (!relation) continue
    const [target] = await db.select().from(tables).where(eq(tables.id, relation.toTableId)).limit(1)
    if (!target) continue
    if (!allows(subject, grants, 'view', { type: 'table', id: target.id, parents: { project: target.projectId } })) continue
    const [targetProject] = await db.select().from(projects).where(eq(projects.id, target.projectId)).limit(1)
    links.push({
      columnId: column.id,
      name: column.name,
      toTableId: target.id,
      toTableName: target.name,
      toProjectName: targetProject?.name ?? '',
      columns: (await loadColumns(db, target.id)).map((item) => ({ id: item.id, name: item.name })),
    })
  }
  return { columns, relations: links }
}

export async function valueForHiddenRef(db: AppDatabase, subject: Subject, ref: RefNode, rowId: string): Promise<FormulaValue> {
  const map = new ValueMap(db, subject, new Set())
  const column = await map.column(ref.columnId)
  if (!column) return { error: '#REF' }
  return map.cell(column, ref.rowId ?? rowId)
}
