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

export type FormulaMark = { from: number; to: number; kind: 'keyword' | 'variable' | 'function' }

export type DefinedFunction = { name: string; signature: string; end: number }

const DECLARATIONS = new Set(['VAR', 'FUNCTION', 'RETURN'])

export function formulaMarks(source: string): FormulaMark[] {
  return scanFormula(source).marks
}

export function userFunctionsBefore(source: string, cursor: number): DefinedFunction[] {
  const seen = new Set<string>()
  const items: DefinedFunction[] = []
  for (const fn of scanFormula(source).functions) {
    if (fn.end > cursor || seen.has(fn.name)) continue
    seen.add(fn.name)
    items.push(fn)
  }
  return items
}

let scanCache: { source: string; result: { marks: FormulaMark[]; functions: DefinedFunction[] } } | null = null

function scanFormula(source: string) {
  if (scanCache?.source === source) return scanCache.result
  const result = collectFormula(source)
  scanCache = { source, result }
  return result
}

function collectFormula(source: string) {
  const marks: FormulaMark[] = []
  const functions: DefinedFunction[] = []
  const defined: string[] = []
  let index = 0
  while (index < source.length) {
    index = skipTrivia(source, index)
    if (index >= source.length) break
    if (source[index] === '$') {
      const name = identAt(source, index + 1)
      if (name && name !== '_') {
        marks.push({ from: index, to: index + 1 + name.length, kind: 'variable' })
        index += 1 + name.length
        continue
      }
      index += 1
      continue
    }
    const word = identAt(source, index)
    if (!word) {
      index += 1
      continue
    }
    const upper = word.toUpperCase()
    const after = skipSpace(source, index + word.length)
    if (DECLARATIONS.has(upper)) marks.push({ from: index, to: index + word.length, kind: 'keyword' })
    if (upper === 'VAR') {
      const name = identAt(source, after)
      if (name && name !== '_') marks.push({ from: after, to: after + name.length, kind: 'variable' })
      index += word.length
      continue
    }
    if (upper === 'FUNCTION') {
      const name = identAt(source, after)
      if (name && /^[A-Z][A-Z0-9_]*$/.test(name)) {
        marks.push({ from: after, to: after + name.length, kind: 'function' })
        const header = readSignature(source, after)
        if (header) {
          for (const param of header.params) marks.push({ from: param.from, to: param.to, kind: 'variable' })
          functions.push({ name, signature: source.slice(after, header.end), end: header.end })
          defined.push(name)
          const body = functionBody(source, header.end)
          if (body) {
            markRegion(source, body.from, body.to, header.params.map((param) => param.name), defined, marks)
            index = body.end
            continue
          }
          index = header.end
          continue
        }
      }
      index += word.length
      continue
    }
    if (defined.includes(word.toUpperCase()) && source[after] === '(') marks.push({ from: index, to: index + word.length, kind: 'function' })
    index += word.length
  }
  return { marks, functions }
}

function markRegion(source: string, from: number, to: number, params: string[], defined: string[], marks: FormulaMark[]) {
  let index = from
  while (index < to) {
    index = skipTrivia(source, index)
    if (index >= to) break
    if (source[index] === '$') {
      const name = identAt(source, index + 1)
      if (name && name !== '_') {
        marks.push({ from: index, to: Math.min(to, index + 1 + name.length), kind: 'variable' })
        index += 1 + name.length
        continue
      }
      index += 1
      continue
    }
    const word = identAt(source, index)
    if (!word || index + word.length > to) {
      index += 1
      continue
    }
    const upper = word.toUpperCase()
    const after = skipSpace(source, index + word.length)
    if (DECLARATIONS.has(upper)) marks.push({ from: index, to: index + word.length, kind: 'keyword' })
    if (upper === 'VAR') {
      const name = identAt(source, after)
      if (name && name !== '_' && after + name.length <= to) marks.push({ from: after, to: after + name.length, kind: 'variable' })
      index += word.length
      continue
    }
    if (defined.includes(word.toUpperCase()) && source[after] === '(') marks.push({ from: index, to: index + word.length, kind: 'function' })
    else if (params.includes(word) && source[after] !== '(') marks.push({ from: index, to: index + word.length, kind: 'variable' })
    index += word.length
  }
}

function readSignature(source: string, nameAt: number) {
  const name = identAt(source, nameAt)
  let index = skipSpace(source, nameAt + name.length)
  if (source[index] !== '(') return null
  index += 1
  const params: { from: number; to: number; name: string }[] = []
  while (index < source.length && source[index] !== ')') {
    index = skipSpace(source, index)
    if (source[index] === ')' || index >= source.length) break
    const param = identAt(source, index)
    if (!param || param === '_') return null
    params.push({ from: index, to: index + param.length, name: param })
    index = skipSpace(source, index + param.length)
    if (source[index] === '=') index = skipValue(source, index + 1)
    index = skipSpace(source, index)
    if (source[index] === ',') index += 1
  }
  if (source[index] !== ')') return null
  return { params, end: index + 1 }
}

function functionBody(source: string, from: number) {
  let index = skipSpace(source, from)
  if (source[index] !== '=') return null
  index = skipSpace(source, index + 1)
  if (source[index] !== '{') return null
  const open = index
  index += 1
  let depth = 1
  while (index < source.length && depth > 0) {
    if (source[index] === '"') {
      index = skipString(source, index)
      continue
    }
    if (source[index] === '[') {
      const end = source.indexOf(']', index + 1)
      index = end === -1 ? source.length : end + 1
      continue
    }
    if (source[index] === '{') {
      const ref = uuidRefAt(source, index)
      if (ref) {
        index += ref
        continue
      }
      depth += 1
      index += 1
      continue
    }
    if (source[index] === '}') {
      depth -= 1
      index += 1
      continue
    }
    index += 1
  }
  return { from: open + 1, to: depth === 0 ? index - 1 : source.length, end: index }
}

function skipValue(source: string, start: number) {
  let index = start
  let depth = 0
  while (index < source.length) {
    if (source[index] === '"') {
      index = skipString(source, index)
      continue
    }
    if (source[index] === '(') depth += 1
    if (source[index] === ')') {
      if (depth === 0) return index
      depth -= 1
    }
    if (source[index] === ',' && depth === 0) return index
    index += 1
  }
  return index
}

function skipTrivia(source: string, index: number) {
  let next = index
  while (next < source.length) {
    if (/\s/.test(source[next] ?? '')) {
      next += 1
      continue
    }
    if (source[next] === '"') {
      next = skipString(source, next)
      continue
    }
    if (source[next] === '[') {
      const end = source.indexOf(']', next + 1)
      if (end === -1) return source.length
      next = end + 1
      continue
    }
    if (source[next] === '{') {
      const ref = uuidRefAt(source, next)
      if (ref) {
        next += ref
        continue
      }
    }
    break
  }
  return next
}

function uuidRefAt(source: string, index: number) {
  const match = /^\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}(?:\.\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\})?(?:@\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\})?/.exec(
    source.slice(index),
  )
  return match?.[0].length ?? 0
}

function identAt(source: string, index: number) {
  return /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(index))?.[0] ?? ''
}

function skipSpace(source: string, index: number) {
  let next = index
  while (next < source.length && /\s/.test(source[next] ?? '')) next += 1
  return next
}

export function functionAt(source: string, pos: number, side: -1 | 1 = -1) {
  const anchor = side < 0 ? pos - 1 : pos
  if (anchor < 0 || anchor >= source.length) return null
  if (!/[A-Za-z0-9_]/.test(source[anchor] ?? '')) return null
  const hidden = maskedRanges(source)
  if (hidden.some((range) => anchor >= range.from && anchor < range.to)) return null
  let from = anchor
  let to = anchor + 1
  while (from > 0 && /[A-Za-z0-9_]/.test(source[from - 1] ?? '') && !hidden.some((range) => from - 1 >= range.from && from - 1 < range.to)) from -= 1
  while (to < source.length && /[A-Za-z0-9_]/.test(source[to] ?? '') && !hidden.some((range) => to >= range.from && to < range.to)) to += 1
  const word = source.slice(from, to)
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(word)) return null
  const name = word.toUpperCase()
  if (FORMULA_HELP.some((item) => item.name === name)) return { name, from, to }
  const user = userFunctionsBefore(source, source.length).find((item) => item.name === name)
  if (!user) return null
  return { name, from, to, signature: user.signature }
}

function maskedRanges(source: string) {
  const ranges: { from: number; to: number }[] = []
  let i = 0
  while (i < source.length) {
    if (source[i] === '"') {
      const end = skipString(source, i)
      ranges.push({ from: i, to: end })
      i = end
      continue
    }
    i += 1
  }
  return [...ranges, ...bracketSpans(source)]
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

function userFunctionOptions(source: string, cursor: number, prefix: string) {
  return userFunctionsBefore(source, cursor)
    .filter((item) => item.name.startsWith(prefix) && !FORMULA_HELP.some((help) => help.name === item.name))
    .map((item) => option(item.name, `${item.name}()`, item.signature))
}

function functionDecision(source: string, cursor: number, explicit: boolean): CompletionDecision | null {
  const match = source.slice(0, cursor).match(/[A-Za-z][A-Za-z0-9_]*$/)
  if (!match) {
    if (!explicit) return null
    return {
      from: cursor,
      kind: 'functions',
      items: [...FORMULA_HELP.map((item) => option(item.name, item.insert, item.example)), ...userFunctionOptions(source, cursor, '')],
    }
  }
  const from = cursor - match[0].length
  const before = source[from - 1]
  if (before && /[0-9._$]/.test(before)) return null
  const prefix = match[0].toUpperCase()
  const items = [
    ...FORMULA_HELP.filter((item) => item.name.startsWith(prefix)).map((item) => option(item.name, item.insert, item.example)),
    ...userFunctionOptions(source, cursor, prefix),
  ]
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
