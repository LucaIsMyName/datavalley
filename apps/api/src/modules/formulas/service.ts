import { and, asc, count, eq, inArray, max, sum } from 'drizzle-orm'
import {
  bracketRowAsks,
  canonicalize,
  collectRefs,
  conditionBlock,
  displayFormula,
  LIMITS,
  parseFormula,
  resolveBrackets,
  runFormula,
  wholeColumnInMath,
  type AstNode,
  type BracketCatalog,
  type FormulaValue,
  type RefNode,
} from '@datavalley/formula-engine'
import type { AppDatabase } from '../../database/client.js'
import {
  columnOptions,
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
import { isDateRangeValue, selectColumnMultiple, swatchName, type FormatRule } from '@datavalley/shared'
import { readCell } from '../../column-types/index.js'
import { badRequest } from '../../errors.js'
import { allows, resolveGrants } from '../../security/access.js'
import { sha256 } from '../../security/crypto.js'
import type { Subject } from '../../security/subject.js'
import { loadColumns, requireTable, resolveTableContext, type LoadedColumn } from '../tables/service.js'

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
  const grants = await resolveGrants(db, subject)
  const names: Record<string, RefNode> = {}
  const elsewhere = new Map<string, { ref: RefNode; count: number }>()
  const projectTables = await db.select().from(tables).where(eq(tables.projectId, table.projectId))
  for (const item of projectTables) {
    if (!allows(subject, grants, 'view', { type: 'table', id: item.id, parents: { project: item.projectId } })) continue
    const dataTableId = item.mirrorOfTableId ?? item.id
    const columns = await loadColumns(db, dataTableId)
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

async function catalogFor(db: AppDatabase, subject: Subject, tableId: string): Promise<BracketCatalog> {
  const table = await requireTable(db, subject, tableId, 'view')
  const grants = await resolveGrants(db, subject)
  const columns: BracketCatalog['columns'] = []
  const projectTables = await db.select().from(tables).where(eq(tables.projectId, table.projectId))
  for (const item of projectTables) {
    if (!allows(subject, grants, 'view', { type: 'table', id: item.id, parents: { project: item.projectId } })) continue
    const dataTableId = item.mirrorOfTableId ?? item.id
    for (const column of await loadColumns(db, dataTableId)) {
      columns.push({ name: column.name, columnId: column.id, tableId: item.id, tableName: item.name })
    }
  }
  const links: BracketCatalog['relations'] = []
  const { shell, physical } = await resolveTableContext(db, subject, tableId, 'view')
  for (const column of await loadColumns(db, physical.id)) {
    if (column.type !== 'relation') continue
    const relationId = String(column.config.relationId ?? '')
    const [relation] = relationId ? await db.select().from(relations).where(eq(relations.id, relationId)).limit(1) : []
    if (!relation) continue
    const [target] = await db.select().from(tables).where(eq(tables.id, relation.toTableId)).limit(1)
    if (!target) continue
    if (!allows(subject, grants, 'view', { type: 'table', id: target.id, parents: { project: target.projectId } })) continue
    const targetDataId = target.mirrorOfTableId ?? target.id
    const fields = await loadColumns(db, targetDataId)
    for (const field of fields) {
      if (!columns.some((item) => item.columnId === field.id)) {
        columns.push({ name: field.name, columnId: field.id, tableId: target.id, tableName: target.name })
      }
    }
    links.push({
      name: column.name,
      columnId: column.id,
      toTableId: target.id,
      toTableName: target.name,
      fields: fields.map((field) => ({ name: field.name, columnId: field.id })),
    })
  }
  return { tableId: shell.id, columns, relations: links, rows: [] }
}

async function rowsForBrackets(db: AppDatabase, asks: { tableName: string; rowNumber: number }[], catalog: BracketCatalog) {
  const rows: BracketCatalog['rows'] = []
  for (const ask of asks) {
    const column = catalog.columns.find((item) => item.tableName === ask.tableName)
    if (!column) continue
    const [meta] = await db.select({ mirrorOfTableId: tables.mirrorOfTableId }).from(tables).where(eq(tables.id, column.tableId)).limit(1)
    const dataTableId = meta?.mirrorOfTableId ?? column.tableId
    const [row] = await db
      .select()
      .from(tableRows)
      .where(and(eq(tableRows.tableId, dataTableId), eq(tableRows.rowNumber, ask.rowNumber)))
      .limit(1)
    if (row) rows.push({ tableId: row.tableId, rowNumber: row.rowNumber, rowId: row.id })
  }
  return rows
}

function everyRowMessage(ref: RefNode, catalog: BracketCatalog) {
  const column = catalog.columns.find((item) => item.columnId === ref.columnId && (!ref.tableId || item.tableId === ref.tableId))
  const label = column ? `${column.tableName} -> ${column.name}` : 'That column'
  return `${label} is every row. Choose one row, or wrap it in SUM.`
}

async function compileFormula(db: AppDatabase, subject: Subject, tableId: string, expression: string) {
  const { names } = await namesFor(db, subject, tableId, expression)
  const catalog = await catalogFor(db, subject, tableId)
  let asks: { tableName: string; rowNumber: number }[]
  try {
    asks = bracketRowAsks(expression)
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'Invalid formula')
  }
  catalog.rows = await rowsForBrackets(db, asks, catalog)
  let canonical: string
  try {
    canonical = canonicalize(resolveBrackets(expression, catalog), names)
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'Invalid formula')
  }
  const ast = parseFormula(canonical)
  const listed = wholeColumnInMath(ast)
  if (listed) throw badRequest(everyRowMessage(listed, catalog))
  return { canonical, ast, catalog }
}

export async function compileCondition(db: AppDatabase, subject: Subject, tableId: string, expression: string) {
  const { canonical, ast, catalog } = await compileFormula(db, subject, tableId, expression)
  const block = conditionBlock(ast)
  if (!block) return canonical
  if (block === 'lookup') throw badRequest('LOOKUP is not available in a condition')
  if (block === 'relation') throw badRequest('A link to another table is not available in a condition')
  if (block === 'cell') throw badRequest('A condition can only read this row')
  const ref = collectRefs(ast).find((item) => item.tableId || item.rowId)
  throw badRequest(ref ? everyRowMessage(ref, catalog) : 'That column is every row. Choose one row, or wrap it in SUM.')
}

function formatColor(value: unknown) {
  if (value == null || value === '') return undefined
  if (typeof value !== 'string') throw badRequest('Invalid color')
  const name = swatchName(value)
  if (name) return name
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase()
  throw badRequest('Invalid color')
}

export async function canonicalizeFormatRules(db: AppDatabase, subject: Subject, tableId: string, rules: unknown) {
  if (!Array.isArray(rules)) throw badRequest('Invalid format rules')
  const prepared: FormatRule[] = []
  for (const raw of rules) {
    if (!raw || typeof raw !== 'object') throw badRequest('Invalid format rule')
    const rule = raw as FormatRule
    const expression = typeof rule.expression === 'string' ? rule.expression.trim() : ''
    if (expression) {
      const color = formatColor(rule.style?.color)
      const background = formatColor(rule.style?.background)
      if (!color && !background) throw badRequest('A condition needs a color')
      prepared.push({
        id: typeof rule.id === 'string' && rule.id ? rule.id : crypto.randomUUID(),
        scope: 'cell',
        columnId: typeof rule.columnId === 'string' ? rule.columnId : undefined,
        expression: await compileCondition(db, subject, tableId, expression),
        style: { ...(color ? { color } : {}), ...(background ? { background } : {}) },
      })
      continue
    }
    prepared.push({
      id: typeof rule.id === 'string' && rule.id ? rule.id : crypto.randomUUID(),
      scope: rule.scope === 'row' ? 'row' : 'cell',
      columnId: typeof rule.columnId === 'string' ? rule.columnId : undefined,
      operator: typeof rule.operator === 'string' ? rule.operator : 'eq',
      value: rule.value,
      valueTo: rule.valueTo,
      style: rule.style && typeof rule.style === 'object' ? rule.style : {},
    })
  }
  return prepared
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
    if (
      column.type === 'tags' ||
      column.type === 'multi_select' ||
      column.type === 'user' ||
      (column.type === 'select' && selectColumnMultiple(column))
    ) {
      const ids = Array.isArray(raw) ? raw.map(String) : []
      const names: string[] = []
      for (const id of ids) names.push(await this.label(column, id))
      return names
    }
    if (column.type === 'status' || column.type === 'select' || column.type === 'radio') return this.label(column, String(raw))
    if (column.type === 'relation') return this.rowTitle(String(raw))
    if (isDateRangeValue(raw)) return [raw.from, raw.to]
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
  const { canonical, ast } = await compileFormula(db, subject, column.tableId, expression)
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

export async function fillFormulas(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  input: { columnId: string; sourceRowId: string; rowIds: string[] },
) {
  const table = await requireTable(db, subject, tableId, 'edit')
  const [column] = await db
    .select()
    .from(tableColumns)
    .where(and(eq(tableColumns.id, input.columnId), eq(tableColumns.tableId, table.id)))
    .limit(1)
  if (!column || column.type !== 'formula') throw badRequest('Unknown column')
  const targets = [...new Set(input.rowIds.filter((id) => id && id !== input.sourceRowId))]
  if (targets.length === 0) return { expression: '', previous: [] as { rowId: string; source: string }[] }
  if (targets.length > 500) throw badRequest('Bulk updates are limited to 500 cells')
  const rows = await db
    .select({ id: tableRows.id })
    .from(tableRows)
    .where(and(eq(tableRows.tableId, table.id), inArray(tableRows.id, [input.sourceRowId, ...targets])))
  const found = new Set(rows.map((row) => row.id))
  if (!found.has(input.sourceRowId) || targets.some((id) => !found.has(id))) throw badRequest('Unknown row')
  const stored = await db
    .select()
    .from(formulas)
    .where(and(eq(formulas.columnId, column.id), inArray(formulas.rowId, [input.sourceRowId, ...targets])))
  const expression = stored.find((item) => item.rowId === input.sourceRowId)?.source ?? ''
  const previous = targets.map((rowId) => ({
    rowId,
    source: stored.find((item) => item.rowId === rowId)?.source ?? '',
  }))
  await db.transaction(async (tx) => {
    for (const rowId of targets) {
      await saveFormula(tx as unknown as AppDatabase, subject, column.id, expression, rowId)
    }
  })
  return { expression, previous }
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
  if (!formula?.canonical) return { source: formula?.source ?? '' }
  try {
    const catalog = await catalogFor(db, subject, column.tableId)
    const ast = parseFormula(formula.canonical)
    const rowIds = [...new Set(collectRefs(ast).flatMap((ref) => (ref.rowId ? [ref.rowId] : [])))]
    if (rowIds.length) {
      const found = await db.select().from(tableRows).where(inArray(tableRows.id, rowIds))
      catalog.rows = found.map((row) => ({ tableId: row.tableId, rowNumber: row.rowNumber, rowId: row.id }))
    }
    return { source: displayFormula(formula.canonical, catalog) ?? formula.source }
  } catch {
    return { source: formula.source }
  }
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
  const grants = await resolveGrants(db, subject)
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
    get: (ref) => {
      const key = refKey(ref, rowId)
      if (!values.has(key)) return { error: '#REF' }
      return values.get(key) ?? null
    },
  })
}

async function tableDependencyStamp(db: AppDatabase, tableId: string) {
  const [summary] = await db
    .select({ total: count(), latest: max(tableRows.updatedAt), versions: sum(tableRows.version) })
    .from(tableRows)
    .where(eq(tableRows.tableId, tableId))
  return `${tableId}:${Number(summary?.total ?? 0)}:${stampTime(summary?.latest)}:${summary?.versions ?? 0}`
}

type StampExpansion = {
  rowIds: Set<string>
  tableIds: Set<string>
  foreignTableIds: Set<string>
  labelColumnIds: Set<string>
  statusTableIds: Set<string>
  tagTableIds: Set<string>
  usesClock: boolean
  usesListCriterion: boolean
}

function astUsesClock(node: AstNode): boolean {
  return astHasCall(node, (name) => name === 'TODAY' || name === 'NOW')
}

function astUsesListCriterion(node: AstNode): boolean {
  return astHasCall(node, (name) => name === 'SUMIF' || name === 'COUNTIF')
}

function astHasCall(node: AstNode, match: (name: string) => boolean): boolean {
  switch (node.type) {
    case 'call':
      if (match(node.name)) return true
      return node.args.some((arg) => astHasCall(arg, match))
    case 'unary':
      return astHasCall(node.expr, match)
    case 'binary':
      return astHasCall(node.left, match) || astHasCall(node.right, match)
    default:
      return false
  }
}

function emptyExpansion(): StampExpansion {
  return {
    rowIds: new Set(),
    tableIds: new Set(),
    foreignTableIds: new Set(),
    labelColumnIds: new Set(),
    statusTableIds: new Set(),
    tagTableIds: new Set(),
    usesClock: false,
    usesListCriterion: false,
  }
}

function noteLabelColumn(expanded: StampExpansion, column: { id: string; type: string; tableId: string }) {
  if (column.type === 'select' || column.type === 'radio' || column.type === 'multi_select') expanded.labelColumnIds.add(column.id)
  if (column.type === 'status') expanded.statusTableIds.add(column.tableId)
  if (column.type === 'tags') expanded.tagTableIds.add(column.tableId)
}

async function expandStampDependencies(db: AppDatabase, roots: { ast: AstNode; rowId: string }[]) {
  const expanded = emptyExpansion()
  const seenFormula = new Set<string>()
  const seenWhole = new Set<string>()
  const queue: { ast: AstNode; rowId: string; depth: number }[] = roots.map((root) => ({ ...root, depth: 0 }))

  while (queue.length > 0) {
    const current = queue.shift()!
    expanded.rowIds.add(current.rowId)
    if (astUsesClock(current.ast)) expanded.usesClock = true
    if (astUsesListCriterion(current.ast)) expanded.usesListCriterion = true
    const refs = collectRefs(current.ast)
    const cellTargets: { columnId: string; rowId: string }[] = []
    const wholeColumnIds: string[] = []

    for (const ref of refs) {
      if (ref.rowId) expanded.rowIds.add(ref.rowId)
      if (ref.tableId) {
        expanded.tableIds.add(ref.tableId)
        expanded.foreignTableIds.add(ref.tableId)
      }
      if (ref.tableId && !ref.rowId) {
        if (!seenWhole.has(ref.columnId)) wholeColumnIds.push(ref.columnId)
        continue
      }
      const targetRowId = ref.rowId ?? current.rowId
      const key = `${ref.columnId}:${targetRowId}`
      if (seenFormula.has(key)) continue
      cellTargets.push({ columnId: ref.columnId, rowId: targetRowId })
    }

    if (current.depth >= LIMITS.maxDependencyDepth) continue

    const columnIds = [...new Set([...cellTargets.map((target) => target.columnId), ...wholeColumnIds])]
    const columns =
      columnIds.length > 0
        ? await db
            .select({ id: tableColumns.id, type: tableColumns.type, tableId: tableColumns.tableId })
            .from(tableColumns)
            .where(inArray(tableColumns.id, columnIds))
        : []
    const columnById = new Map(columns.map((column) => [column.id, column]))

    for (const target of cellTargets) {
      const column = columnById.get(target.columnId)
      if (!column) continue
      noteLabelColumn(expanded, column)
      const key = `${target.columnId}:${target.rowId}`
      if (seenFormula.has(key) || column.type !== 'formula') continue
      seenFormula.add(key)
      const [formula] = await db
        .select({ ast: formulas.ast })
        .from(formulas)
        .where(and(eq(formulas.columnId, target.columnId), eq(formulas.rowId, target.rowId)))
        .limit(1)
      if (!formula?.ast) continue
      queue.push({ ast: formula.ast as AstNode, rowId: target.rowId, depth: current.depth + 1 })
    }

    for (const columnId of wholeColumnIds) {
      if (seenWhole.has(columnId)) continue
      seenWhole.add(columnId)
      const column = columnById.get(columnId)
      if (!column) continue
      noteLabelColumn(expanded, column)
      if (column.type !== 'formula') continue
      const stored = await db
        .select({ ast: formulas.ast, rowId: formulas.rowId })
        .from(formulas)
        .where(eq(formulas.columnId, columnId))
      for (const formula of stored) {
        const key = `${columnId}:${formula.rowId}`
        if (seenFormula.has(key) || !formula.ast) continue
        seenFormula.add(key)
        queue.push({ ast: formula.ast as AstNode, rowId: formula.rowId, depth: current.depth + 1 })
      }
    }
  }

  return expanded
}

function dependencyStampFromExpanded(
  rowVersions: Map<string, number>,
  tableStamps: Map<string, string>,
  expanded: { rowIds: Set<string>; tableIds: Set<string> },
) {
  const rowStamp = [...expanded.rowIds]
    .map((id) => `${id}:${rowVersions.get(id) ?? 0}`)
    .sort()
    .join(',')
  const tablesStamp = [...expanded.tableIds]
    .map((id) => tableStamps.get(id) ?? '')
    .sort()
    .join(',')
  return `${rowStamp}|${tablesStamp}`
}

function clockDay(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

function composeVersionHash(
  expanded: StampExpansion,
  rowVersions: Map<string, number>,
  tableStamps: Map<string, string>,
  labelStamps: Map<string, string>,
  statusStamps: Map<string, string>,
  tagStamps: Map<string, string>,
  day: string,
  updatedAt: string,
) {
  const base = dependencyStampFromExpanded(rowVersions, tableStamps, expanded)
  const labels = [
    ...[...expanded.labelColumnIds].sort().map((id) => labelStamps.get(id) ?? ''),
    ...[...expanded.statusTableIds].sort().map((id) => `status:${statusStamps.get(id) ?? ''}`),
    ...[...expanded.tagTableIds].sort().map((id) => `tag:${tagStamps.get(id) ?? ''}`),
  ].join(',')
  const clock = expanded.usesClock ? day : ''
  const listMatch = expanded.usesListCriterion ? 'list' : ''
  return `${base}|${labels}|${clock}|${listMatch}:${updatedAt}`
}

function crossesOtherTables(expanded: StampExpansion, tableId: string) {
  for (const id of expanded.foreignTableIds) {
    if (id !== tableId) return true
  }
  return false
}

async function loadCatalogStamps(db: AppDatabase, expansions: StampExpansion[]) {
  const labelColumnIds = new Set<string>()
  const statusTableIds = new Set<string>()
  const tagTableIds = new Set<string>()
  for (const expanded of expansions) {
    for (const id of expanded.labelColumnIds) labelColumnIds.add(id)
    for (const id of expanded.statusTableIds) statusTableIds.add(id)
    for (const id of expanded.tagTableIds) tagTableIds.add(id)
  }
  const labelStamps = new Map<string, string>()
  if (labelColumnIds.size > 0) {
    const options = await db
      .select({ columnId: columnOptions.columnId, id: columnOptions.id, label: columnOptions.label })
      .from(columnOptions)
      .where(inArray(columnOptions.columnId, [...labelColumnIds]))
    const grouped = new Map<string, string[]>()
    for (const option of options) {
      const list = grouped.get(option.columnId) ?? []
      list.push(`${option.id}:${option.label}`)
      grouped.set(option.columnId, list)
    }
    for (const columnId of labelColumnIds) {
      labelStamps.set(columnId, (grouped.get(columnId) ?? []).sort().join(','))
    }
  }
  const statusStamps = new Map<string, string>()
  if (statusTableIds.size > 0) {
    const statuses = await db
      .select({ tableId: tableStatuses.tableId, id: tableStatuses.id, name: tableStatuses.name })
      .from(tableStatuses)
      .where(inArray(tableStatuses.tableId, [...statusTableIds]))
    const grouped = new Map<string, string[]>()
    for (const status of statuses) {
      const list = grouped.get(status.tableId) ?? []
      list.push(`${status.id}:${status.name}`)
      grouped.set(status.tableId, list)
    }
    for (const tableId of statusTableIds) statusStamps.set(tableId, (grouped.get(tableId) ?? []).sort().join(','))
  }
  const tagStamps = new Map<string, string>()
  if (tagTableIds.size > 0) {
    const tags = await db
      .select({ tableId: tableTags.tableId, id: tableTags.id, name: tableTags.name })
      .from(tableTags)
      .where(inArray(tableTags.tableId, [...tagTableIds]))
    const grouped = new Map<string, string[]>()
    for (const tag of tags) {
      const list = grouped.get(tag.tableId) ?? []
      list.push(`${tag.id}:${tag.name}`)
      grouped.set(tag.tableId, list)
    }
    for (const tableId of tagTableIds) tagStamps.set(tableId, (grouped.get(tableId) ?? []).sort().join(','))
  }
  return { labelStamps, statusStamps, tagStamps }
}

async function dependencyStamp(db: AppDatabase, rowId: string, ast: AstNode) {
  const expanded = await expandStampDependencies(db, [{ ast, rowId }])
  const rows = expanded.rowIds.size
    ? await db.select().from(tableRows).where(inArray(tableRows.id, [...expanded.rowIds]))
    : []
  const rowVersions = new Map(rows.map((row) => [row.id, row.version]))
  const tableStamps = new Map<string, string>()
  for (const tableId of expanded.tableIds) {
    tableStamps.set(tableId, await tableDependencyStamp(db, tableId))
  }
  const catalogs = await loadCatalogStamps(db, [expanded])
  return composeVersionHash(
    expanded,
    rowVersions,
    tableStamps,
    catalogs.labelStamps,
    catalogs.statusStamps,
    catalogs.tagStamps,
    clockDay(),
    '',
  )
}

function formulaCellKey(rowId: string, columnId: string | null) {
  return `${rowId}:${columnId ?? ''}`
}

async function buildStampContext(db: AppDatabase, entries: (typeof formulas.$inferSelect)[]) {
  const perEntry = new Map<string, StampExpansion>()
  const rowIds = new Set<string>()
  const tableIds = new Set<string>()
  for (const entry of entries) {
    const expanded = await expandStampDependencies(db, [{ ast: entry.ast as AstNode, rowId: entry.rowId }])
    perEntry.set(entry.id, expanded)
    for (const id of expanded.rowIds) rowIds.add(id)
    for (const id of expanded.tableIds) tableIds.add(id)
  }
  const rowVersions = new Map<string, number>()
  if (rowIds.size > 0) {
    const rows = await db
      .select({ id: tableRows.id, version: tableRows.version })
      .from(tableRows)
      .where(inArray(tableRows.id, [...rowIds]))
    for (const row of rows) rowVersions.set(row.id, row.version)
  }
  const tableStamps = new Map<string, string>()
  for (const tableId of tableIds) {
    tableStamps.set(tableId, await tableDependencyStamp(db, tableId))
  }
  const catalogs = await loadCatalogStamps(db, [...perEntry.values()])
  return { rowVersions, tableStamps, perEntry, ...catalogs, day: clockDay() }
}

export async function evaluateFormulasForRows(
  db: AppDatabase,
  subject: Subject,
  entries: (typeof formulas.$inferSelect)[],
  options: { stack?: Set<string> } = {},
): Promise<Map<string, FormulaValue>> {
  const values = new Map<string, FormulaValue>()
  if (entries.length === 0) return values

  const grants = await resolveGrants(db, subject)
  const crossPermissionHash = sha256(JSON.stringify(grants))
  const permissionHashFor = (crossesTables: boolean) => (crossesTables ? crossPermissionHash : '')

  const formulaIds = [...new Set(entries.map((entry) => entry.id))]
  const pageRowIds = [...new Set(entries.map((entry) => entry.rowId))]
  const cachedRows =
    formulaIds.length > 0 && pageRowIds.length > 0
      ? await db
          .select()
          .from(formulaCache)
          .where(and(inArray(formulaCache.formulaId, formulaIds), inArray(formulaCache.rowId, pageRowIds)))
      : []
  const cacheByKey = new Map(cachedRows.map((row) => [`${row.formulaId}:${row.rowId}:${row.permissionHash}`, row]))

  const { rowVersions, tableStamps, perEntry, labelStamps, statusStamps, tagStamps, day } = await buildStampContext(db, entries)
  const stack = options.stack ?? new Set<string>()
  const misses: {
    entry: (typeof formulas.$inferSelect)
    versionHash: string
    permissionHash: string
  }[] = []

  for (const entry of entries) {
    if (!entry.columnId) continue
    const key = formulaCellKey(entry.rowId, entry.columnId)
    const expanded = perEntry.get(entry.id) ?? emptyExpansion()
    if (expanded.rowIds.size === 0) expanded.rowIds.add(entry.rowId)
    const permissionHash = permissionHashFor(entry.crossesTables || crossesOtherTables(expanded, entry.tableId))
    const versionHash = composeVersionHash(
      expanded,
      rowVersions,
      tableStamps,
      labelStamps,
      statusStamps,
      tagStamps,
      day,
      entry.updatedAt.toISOString(),
    )
    const cached = cacheByKey.get(`${entry.id}:${entry.rowId}:${permissionHash}`)
    if (cached && cached.versionHash === versionHash) {
      values.set(key, cached.result as FormulaValue)
      continue
    }
    misses.push({ entry, versionHash, permissionHash })
  }

  for (const miss of misses) {
    const { entry, versionHash, permissionHash } = miss
    if (!entry.columnId) continue
    const key = formulaCellKey(entry.rowId, entry.columnId)
    if (stack.has(entry.id)) {
      values.set(key, { error: '#CYCLE' })
      continue
    }
    stack.add(entry.id)
    try {
      const resolved = await evaluateAst(db, subject, entry.ast as AstNode, entry.rowId, stack)
      await db
        .insert(formulaCache)
        .values({
          formulaId: entry.id,
          rowId: entry.rowId,
          permissionHash,
          versionHash,
          result: resolved as never,
        })
        .onConflictDoUpdate({
          target: [formulaCache.formulaId, formulaCache.rowId, formulaCache.permissionHash],
          set: { versionHash, result: resolved as never },
        })
      values.set(key, resolved)
    } finally {
      stack.delete(entry.id)
    }
  }

  return values
}

function stampTime(value: Date | string | null | undefined) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toISOString()
}

export async function evaluateStored(db: AppDatabase, subject: Subject, formulaId: string, rowId: string, stack = new Set<string>()) {
  if (stack.has(formulaId)) return { error: '#CYCLE' as const }
  const [formula] = await db.select().from(formulas).where(eq(formulas.id, formulaId)).limit(1)
  if (!formula) throw badRequest('Unknown formula')
  const results = await evaluateFormulasForRows(db, subject, [formula], { stack })
  if (!formula.columnId) return { error: '#N/A' as const }
  return results.get(formulaCellKey(formula.rowId, formula.columnId)) ?? { error: '#N/A' as const }
}

export async function previewFormula(db: AppDatabase, subject: Subject, tableId: string, expression: string, rowId?: string) {
  const { canonical, ast } = await compileFormula(db, subject, tableId, expression)
  const value = await evaluateAst(db, subject, ast, rowId ?? '')
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
  const grants = await resolveGrants(db, subject)
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
