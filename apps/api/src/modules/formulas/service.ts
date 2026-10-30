import { and, eq } from 'drizzle-orm'
import {
  canonicalize,
  collectRefs,
  isFormulaError,
  parseFormula,
  runFormula,
  type AstNode,
  type FormulaValue,
  type RefNode,
} from '@datavalley/formula-engine'
import type { AppDatabase } from '../../database/client.js'
import { formulaCache, formulaDependencies, formulas, tableCells, tableColumns, tableRows, tables } from '../../database/schema.js'
import { readCell } from '../../column-types/index.js'
import { badRequest } from '../../errors.js'
import { allows, loadGrants } from '../../security/access.js'
import { sha256 } from '../../security/crypto.js'
import type { Subject } from '../../security/subject.js'
import { loadColumns, requireTable } from '../tables/service.js'

async function namesFor(db: AppDatabase, subject: Subject, tableId: string) {
  const table = await requireTable(db, subject, tableId, 'view')
  const grants = await loadGrants(db, subject)
  const names: Record<string, RefNode> = {}
  const projectTables = await db.select().from(tables).where(eq(tables.projectId, table.projectId))
  for (const item of projectTables) {
    if (!allows(subject, grants, 'view', { type: 'table', id: item.id, parents: { project: item.projectId } })) continue
    const columns = await loadColumns(db, item.id)
    for (const column of columns) {
      if (item.id === tableId) names[column.name] = { columnId: column.id }
      names[`${item.name}.${column.name}`] = { tableId: item.id, columnId: column.id }
    }
  }
  return { table, names, grants }
}

export async function saveFormula(db: AppDatabase, subject: Subject, columnId: string, expression: string) {
  const [column] = await db.select().from(tableColumns).where(eq(tableColumns.id, columnId)).limit(1)
  if (!column) throw badRequest('Unknown column')
  const { names } = await namesFor(db, subject, column.tableId)
  let canonical: string
  try {
    canonical = canonicalize(expression, names)
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'Invalid formula')
  }
  const ast = parseFormula(canonical)
  const refs = collectRefs(ast)
  const crosses = refs.some((ref) => ref.tableId && ref.tableId !== column.tableId)
  const cycle = await hasCycle(db, column.tableId, column.id, refs.map((ref) => ref.columnId))
  await db.delete(formulas).where(eq(formulas.columnId, column.id))
  const [formula] = await db
    .insert(formulas)
    .values({
      tableId: column.tableId,
      columnId: column.id,
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
  return { id: formula.id, canonical, cycle }
}

async function hasCycle(db: AppDatabase, tableId: string, columnId: string, next: string[]) {
  const existing = await db.select().from(formulas).where(eq(formulas.tableId, tableId))
  const graph = new Map<string, string[]>()
  for (const formula of existing) {
    if (!formula.columnId || formula.columnId === columnId) continue
    const deps = await db.select().from(formulaDependencies).where(eq(formulaDependencies.formulaId, formula.id))
    graph.set(formula.columnId, deps.map((dep) => dep.columnId).filter((id): id is string => Boolean(id)))
  }
  graph.set(columnId, next)
  const seen = new Set<string>()
  const stack = [...next]
  while (stack.length) {
    const current = stack.pop()!
    if (current === columnId) return true
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

async function preload(db: AppDatabase, subject: Subject, ast: AstNode, rowId: string) {
  const values = new Map<string, FormulaValue>()
  for (const ref of collectRefs(ast)) {
    const key = refKey(ref, rowId)
    if (values.has(key)) continue
    if (!(await canReadColumn(db, subject, ref.columnId))) {
      values.set(key, { error: '#REF' })
      continue
    }
    const [column] = await db.select().from(tableColumns).where(eq(tableColumns.id, ref.columnId)).limit(1)
    if (!column) {
      values.set(key, { error: '#REF' })
      continue
    }
    const columns = await loadColumns(db, column.tableId)
    const loaded = columns.find((item) => item.id === column.id)
    if (ref.tableId && !ref.rowId) {
      const cells = await db.select().from(tableCells).where(eq(tableCells.columnId, ref.columnId))
      values.set(
        key,
        cells.map((cell) => (loaded ? readCell(loaded, cell) : null)).filter((value) => typeof value === 'number'),
      )
      continue
    }
    const [cell] = await db
      .select()
      .from(tableCells)
      .where(and(eq(tableCells.columnId, ref.columnId), eq(tableCells.rowId, ref.rowId ?? rowId)))
      .limit(1)
    const value = loaded ? readCell(loaded, cell) : null
    values.set(key, value == null ? null : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null)
  }
  return values
}

export async function evaluateAst(db: AppDatabase, subject: Subject, ast: AstNode, rowId: string) {
  if ((ast as { cycle?: boolean }).cycle) return { error: '#CYCLE' as const }
  const values = await preload(db, subject, ast, rowId)
  return runFormula(ast, {
    clock: () => new Date(),
    range: () => [{ error: '#REF' }],
    lookup: () => ({ error: '#N/A' }),
    get: (ref) => values.get(refKey(ref, rowId)) ?? { error: '#REF' },
  })
}

export async function evaluateStored(db: AppDatabase, subject: Subject, formulaId: string, rowId: string) {
  const [formula] = await db.select().from(formulas).where(eq(formulas.id, formulaId)).limit(1)
  if (!formula) throw badRequest('Unknown formula')
  const grants = await loadGrants(db, subject)
  const permissionHash = formula.crossesTables ? sha256(JSON.stringify(grants)) : ''
  const [row] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
  const versionHash = `${row?.version ?? 0}:${formula.updatedAt.toISOString()}`
  const [cached] = await db
    .select()
    .from(formulaCache)
    .where(and(eq(formulaCache.formulaId, formula.id), eq(formulaCache.rowId, rowId), eq(formulaCache.permissionHash, permissionHash)))
  if (cached && cached.versionHash === versionHash && !formula.crossesTables) return cached.result as FormulaValue
  const resolved = await evaluateAst(db, subject, formula.ast as AstNode, rowId)
  await db
    .insert(formulaCache)
    .values({ formulaId: formula.id, rowId, permissionHash, versionHash, result: resolved as never })
    .onConflictDoUpdate({
      target: [formulaCache.formulaId, formulaCache.rowId, formulaCache.permissionHash],
      set: { versionHash, result: resolved as never },
    })
  return resolved
}

export async function previewFormula(db: AppDatabase, subject: Subject, tableId: string, expression: string, rowId?: string) {
  const { names } = await namesFor(db, subject, tableId)
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

export async function valueForHiddenRef(db: AppDatabase, subject: Subject, ref: RefNode, rowId: string): Promise<FormulaValue> {
  const allowed = await canReadColumn(db, subject, ref.columnId)
  if (!allowed) return { error: '#REF' }
  const targetRow = ref.rowId ?? rowId
  const [cell] = await db
    .select()
    .from(tableCells)
    .where(and(eq(tableCells.columnId, ref.columnId), eq(tableCells.rowId, targetRow)))
    .limit(1)
  if (!cell) return null
  const [column] = await db.select().from(tableColumns).where(eq(tableColumns.id, ref.columnId)).limit(1)
  if (!column) return { error: '#REF' }
  const columns = await loadColumns(db, column.tableId)
  const loaded = columns.find((item) => item.id === column.id)
  if (!loaded) return { error: '#REF' }
  const value = readCell(loaded, cell)
  if (value == null) return null
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : String(value)
}
