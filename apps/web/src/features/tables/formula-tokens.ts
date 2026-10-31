import { FORMULA_HELP } from './formula-help'

export type BracketSpan = { from: number; to: number; body: string }

export type FormulaCatalog = {
  tableId: string
  columns: { tableId: string; tableName: string; columnId: string; columnName: string }[]
  relations: { name: string; columns: { name: string }[] }[]
}

export type FormulaOption = {
  label: string
  detail?: string
  apply: string
  cursor: number
}

export type CompletionDecision =
  | { from: number; kind: 'functions'; items: FormulaOption[] }
  | { from: number; kind: 'brackets'; items: FormulaOption[] }
  | { from: number; kind: 'rows'; tableId: string; tableName: string; columnName: string; prefix: string }

export type BracketKind = 'row' | 'cell' | 'relation' | 'column'

function skipString(source: string, index: number) {
  let i = index + 1
  while (i < source.length) {
    if (source[i] === '"' && source[i + 1] === '"') {
      i += 2
      continue
    }
    if (source[i] === '\\' && source[i + 1] === '"') {
      i += 2
      continue
    }
    if (source[i] === '"') return i + 1
    i += 1
  }
  return source.length
}

export function bracketSpans(source: string): BracketSpan[] {
  const spans: BracketSpan[] = []
  let i = 0
  while (i < source.length) {
    if (source[i] === '"') {
      i = skipString(source, i)
      continue
    }
    if (source[i] !== '[') {
      i += 1
      continue
    }
    const start = i
    let j = i + 1
    let closed = -1
    while (j < source.length) {
      if (source[j] === '"') {
        j = skipString(source, j)
        continue
      }
      if (source[j] === '[') break
      if (source[j] === ']') {
        closed = j
        break
      }
      j += 1
    }
    if (closed === -1) {
      i += 1
      continue
    }
    spans.push({ from: start, to: closed + 1, body: source.slice(start + 1, closed) })
    i = closed + 1
  }
  return spans
}

export function adjacentBracket(source: string, cursor: number, key: 'Backspace' | 'Delete') {
  const spans = bracketSpans(source)
  if (key === 'Backspace') return spans.find((span) => span.to === cursor) ?? null
  return spans.find((span) => span.from === cursor) ?? null
}

export function deleteAdjacentBracket(source: string, cursor: number, key: 'Backspace' | 'Delete') {
  const span = adjacentBracket(source, cursor, key)
  if (!span) return null
  return { value: source.slice(0, span.from) + source.slice(span.to), cursor: span.from }
}

export function changeBreaksBracket(source: string, from: number, to: number) {
  return bracketSpans(source).some((span) => {
    const overlaps = from < span.to && to > span.from
    const covers = from <= span.from && to >= span.to
    return overlaps && !covers
  })
}

function scanOpen(source: string, cursor: number) {
  let i = 0
  let quote = false
  let open: number | null = null
  const limit = Math.min(cursor, source.length)
  while (i < limit) {
    if (quote) {
      if (source[i] === '"' && source[i + 1] === '"') {
        i += 2
        continue
      }
      if (source[i] === '\\' && source[i + 1] === '"') {
        i += 2
        continue
      }
      if (source[i] === '"') quote = false
      i += 1
      continue
    }
    if (source[i] === '"') {
      quote = true
      i += 1
      continue
    }
    if (source[i] === '[') open = i
    if (source[i] === ']') open = null
    i += 1
  }
  return { quote, open }
}

export function openBracket(source: string, cursor: number) {
  const { quote, open } = scanOpen(source, cursor)
  if (quote || open == null) return null
  return { from: open, body: source.slice(open + 1, Math.min(cursor, source.length)) }
}

function insideClosedBracket(source: string, cursor: number) {
  return bracketSpans(source).some((span) => cursor > span.from && cursor < span.to)
}

export function badgeLabel(body: string) {
  return body.replace(/\s*->\s*/g, ' → ')
}

export function classifyBracket(body: string, catalog: FormulaCatalog): BracketKind {
  const parts = body.split('->').map((part) => part.trim())
  if (parts.length >= 3) return 'cell'
  if (parts.length === 2 && catalog.relations.some((relation) => relation.name === parts[0])) return 'relation'
  if (parts.length === 2) return 'column'
  return 'row'
}

export function catalogTables(catalog: FormulaCatalog) {
  const tables: { tableId: string; tableName: string }[] = []
  for (const column of catalog.columns) {
    if (!tables.some((item) => item.tableId === column.tableId)) {
      tables.push({ tableId: column.tableId, tableName: column.tableName })
    }
  }
  return tables
}

export function rowText(row: { id: string; rowNumber: number; cells: Record<string, unknown> }) {
  const text = Object.values(row.cells).find((item) => typeof item === 'string' && item.trim())
  if (typeof text === 'string') return text
  return String(row.rowNumber || row.id.slice(0, 8))
}

function option(label: string, apply: string, detail?: string): FormulaOption {
  const cursor = apply.endsWith('()') ? apply.length - 1 : apply.length
  return detail ? { label, detail, apply, cursor } : { label, apply, cursor }
}

function startsWith(name: string, query: string) {
  return name.toLowerCase().startsWith(query.trim().toLowerCase())
}

function functionDecision(source: string, cursor: number, explicit: boolean): CompletionDecision | null {
  const match = source.slice(0, cursor).match(/[A-Za-z][A-Za-z0-9]*$/)
  if (!match) {
    if (!explicit) return null
    return { from: cursor, kind: 'functions', items: FORMULA_HELP.map((item) => option(item.name, item.insert, item.example)) }
  }
  const from = cursor - match[0].length
  const before = source[from - 1]
  if (before && /[0-9._]/.test(before)) return null
  const prefix = match[0].toUpperCase()
  const items = FORMULA_HELP.filter((item) => item.name.startsWith(prefix)).map((item) => option(item.name, item.insert, item.example))
  if (items.length === 0) return null
  return { from, kind: 'functions', items }
}

function oneSegment(from: number, raw: string, catalog: FormulaCatalog, columnId?: string): CompletionDecision | null {
  const query = raw.trim()
  const items: FormulaOption[] = []
  for (const column of catalog.columns) {
    if (column.tableId !== catalog.tableId || column.columnId === columnId) continue
    if (!startsWith(column.columnName, query)) continue
    items.push(option(column.columnName, `[${column.columnName}]`))
  }
  for (const table of catalogTables(catalog)) {
    if (!startsWith(table.tableName, query)) continue
    items.push(option(`${table.tableName} ->`, `[${table.tableName} -> `))
  }
  for (const relation of catalog.relations) {
    if (!startsWith(relation.name, query)) continue
    items.push(option(`${relation.name} ->`, `[${relation.name} -> `))
  }
  if (items.length === 0) return null
  return { from, kind: 'brackets', items }
}

function twoSegments(from: number, leftRaw: string, rightRaw: string, catalog: FormulaCatalog, columnId?: string): CompletionDecision | null {
  const left = leftRaw.trim()
  const right = rightRaw.trim()
  const relation = catalog.relations.find((item) => item.name === left)
  if (relation) {
    const items = relation.columns
      .filter((column) => startsWith(column.name, right))
      .map((column) => option(column.name, `[${relation.name} -> ${column.name}]`))
    return items.length ? { from, kind: 'brackets', items } : null
  }
  const table = catalogTables(catalog).find((item) => item.tableName === left)
  if (!table) return null
  const items: FormulaOption[] = []
  for (const column of catalog.columns) {
    if (column.tableId !== table.tableId || !startsWith(column.columnName, right)) continue
    if (column.columnId === columnId && table.tableId === catalog.tableId) continue
    items.push(option(column.columnName, `[${table.tableName} -> ${column.columnName}]`))
    items.push(option(`${column.columnName} -> #`, `[${table.tableName} -> ${column.columnName} -> #`))
  }
  return items.length ? { from, kind: 'brackets', items } : null
}

function threeSegments(from: number, tableRaw: string, columnRaw: string, rowRaw: string, catalog: FormulaCatalog): CompletionDecision | null {
  const tableName = tableRaw.trim()
  const columnName = columnRaw.trim()
  const third = rowRaw.trim()
  if (third !== '' && !third.startsWith('#')) return null
  const table = catalogTables(catalog).find((item) => item.tableName === tableName)
  const column = catalog.columns.find((item) => item.tableId === table?.tableId && item.columnName === columnName)
  if (!table || !column) return null
  return {
    from,
    kind: 'rows',
    tableId: table.tableId,
    tableName: table.tableName,
    columnName: column.columnName,
    prefix: third.replace(/^#/, ''),
  }
}

export function completionAt(source: string, cursor: number, catalog: FormulaCatalog, explicit: boolean, columnId?: string): CompletionDecision | null {
  const { quote } = scanOpen(source, cursor)
  if (quote || insideClosedBracket(source, cursor)) return null
  const open = openBracket(source, cursor)
  if (!open) return functionDecision(source, cursor, explicit)
  const parts = open.body.split('->')
  if (parts.length === 1) return oneSegment(open.from, parts[0] ?? '', catalog, columnId)
  if (parts.length === 2) return twoSegments(open.from, parts[0] ?? '', parts[1] ?? '', catalog, columnId)
  if (parts.length === 3) return threeSegments(open.from, parts[0] ?? '', parts[1] ?? '', parts[2] ?? '', catalog)
  return null
}

export function applyCompletion(source: string, from: number, to: number, item: FormulaOption) {
  const value = source.slice(0, from) + item.apply + source.slice(to)
  return { value, cursor: from + item.cursor }
}
