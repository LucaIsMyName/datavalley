import type { AstNode, RefNode } from './ast.js'
import { FormulaSyntaxError, parseFormula } from './parse.js'

export type BracketColumn = {
  name: string
  columnId: string
  tableId: string
  tableName: string
}

export type BracketRelation = {
  name: string
  columnId: string
  toTableId: string
  toTableName: string
  fields: { name: string; columnId: string }[]
}

export type BracketRow = {
  tableId: string
  rowNumber: number
  rowId: string
}

export type BracketCatalog = {
  tableId: string
  columns: BracketColumn[]
  relations: BracketRelation[]
  rows: BracketRow[]
}

const MATH = new Set(['+', '-', '*', '/', '%'])
const AGGREGATES = new Set(['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'COUNTA', 'COUNTIF', 'SUMIF', 'FOR'])

class Unprintable extends Error {}

function reserved(name: string) {
  return name.includes(']') || name.includes('->')
}

function assertName(name: string) {
  if (reserved(name)) throw new FormulaSyntaxError('Column name cannot contain ] or ->')
}

function partsOf(body: string) {
  const parts = body.split('->').map((part) => part.trim())
  if (parts.some((part) => part.length === 0)) throw new FormulaSyntaxError('A reference has an empty name')
  return parts
}

function refuseReserved(body: string, catalog: BracketCatalog) {
  const names = [
    ...catalog.columns.flatMap((column) => [column.name, column.tableName]),
    ...catalog.relations.flatMap((relation) => [relation.name, ...relation.fields.map((field) => field.name)]),
  ]
  if (names.some((name) => reserved(name) && body.includes(name))) {
    throw new FormulaSyntaxError('Column name cannot contain ] or ->')
  }
}

function resolveBody(body: string, catalog: BracketCatalog) {
  refuseReserved(body, catalog)
  const parts = partsOf(body)
  if (parts.length === 1) {
    const column = catalog.columns.find((item) => item.tableId === catalog.tableId && item.name === parts[0])
    if (!column) throw new FormulaSyntaxError(`Unknown column ${parts[0]}`)
    assertName(column.name)
    return `{${column.columnId}}`
  }
  if (parts.length === 2) {
    const [left, right] = parts
    const relation = catalog.relations.find((item) => item.name === left)
    if (relation) {
      assertName(relation.name)
      const field = relation.fields.find((item) => item.name === right)
      if (!field) throw new FormulaSyntaxError(`Unknown field ${right}`)
      assertName(field.name)
      return `RELATION({${relation.columnId}}, {${relation.toTableId}}.{${field.columnId}})`
    }
    const column = catalog.columns.find((item) => item.tableName === left && item.name === right)
    if (!column) throw new FormulaSyntaxError(`Unknown column ${right}`)
    assertName(column.tableName)
    assertName(column.name)
    return `{${column.tableId}}.{${column.columnId}}`
  }
  if (parts.length === 3) {
    const [tableName, columnName, rowPart] = parts
    const rowMatch = /^#(\d+)$/.exec(rowPart)
    if (!rowMatch) throw new FormulaSyntaxError('A cell reference ends with # and a row number')
    const column = catalog.columns.find((item) => item.tableName === tableName && item.name === columnName)
    if (!column) throw new FormulaSyntaxError(`Unknown column ${columnName}`)
    assertName(column.tableName)
    assertName(column.name)
    const rowNumber = Number(rowMatch[1])
    const row = catalog.rows.find((item) => item.tableId === column.tableId && item.rowNumber === rowNumber)
    if (!row) throw new FormulaSyntaxError(`Unknown row #${rowNumber}`)
    return `{${column.tableId}}.{${column.columnId}}@{${row.rowId}}`
  }
  throw new FormulaSyntaxError('A reference has one, two, or three names')
}

function replaceBrackets(expression: string, replace: (body: string) => string) {
  let out = ''
  let i = 0
  while (i < expression.length) {
    const char = expression[i]
    if (char === '"') {
      const start = i
      i++
      while (i < expression.length) {
        if (expression[i] === '"') {
          if (expression[i + 1] === '"') {
            i += 2
            continue
          }
          i++
          break
        }
        if (expression[i] === '\\' && expression[i + 1] === '"') {
          i += 2
          continue
        }
        i++
      }
      out += expression.slice(start, i)
      continue
    }
    if (char === '[') {
      const end = expression.indexOf(']', i + 1)
      if (end < 0) throw new FormulaSyntaxError('Missing ]')
      out += replace(expression.slice(i + 1, end))
      i = end + 1
      continue
    }
    out += char
    i++
  }
  return out
}

export function bracketRowAsks(expression: string) {
  const asks: { tableName: string; rowNumber: number }[] = []
  replaceBrackets(expression, (body) => {
    const parts = body.split('->').map((part) => part.trim())
    const rowMatch = parts.length === 3 ? /^#(\d+)$/.exec(parts[2]) : null
    if (rowMatch) asks.push({ tableName: parts[0], rowNumber: Number(rowMatch[1]) })
    return ''
  })
  return asks
}

export function resolveBrackets(expression: string, catalog: BracketCatalog) {
  return replaceBrackets(expression, (body) => resolveBody(body, catalog))
}

function bareColumn(node: AstNode): RefNode | null {
  if (node.type === 'ref' && node.ref.tableId && !node.ref.rowId) return node.ref
  if (node.type === 'call' && AGGREGATES.has(node.name)) return null
  if (node.type === 'unary' && node.op === '-') return bareColumn(node.expr)
  if (node.type === 'binary' && MATH.has(node.op)) return bareColumn(node.left) ?? bareColumn(node.right)
  if (node.type === 'call') {
    for (const arg of node.args) {
      const found = bareColumn(arg)
      if (found) return found
    }
  }
  return null
}

function walkMath(node: AstNode): RefNode | null {
  if (node.type === 'binary' && MATH.has(node.op)) {
    return bareColumn(node.left) ?? bareColumn(node.right) ?? walkMath(node.left) ?? walkMath(node.right)
  }
  if (node.type === 'unary' && node.op === '-') return bareColumn(node.expr) ?? walkMath(node.expr)
  if (node.type === 'unary') return walkMath(node.expr)
  if (node.type === 'binary') return walkMath(node.left) ?? walkMath(node.right)
  if (node.type === 'call') {
    for (const arg of node.args) {
      const found = walkMath(arg)
      if (found) return found
    }
  }
  return null
}

export function wholeColumnInMath(node: AstNode) {
  return walkMath(node)
}

function precedence(op: string) {
  if (op === 'OR') return 1
  if (op === 'AND') return 2
  if (op === '&') return 4
  if (op === '+' || op === '-') return 5
  if (op === '*' || op === '/' || op === '%') return 6
  return 3
}

function columnLabel(column: BracketColumn) {
  if (reserved(column.tableName) || reserved(column.name)) throw new Unprintable()
  return column
}

function printRef(ref: RefNode, catalog: BracketCatalog) {
  if (ref.rowId) {
    const column = catalog.columns.find((item) => item.columnId === ref.columnId)
    const row = catalog.rows.find((item) => item.rowId === ref.rowId)
    if (!column || !row) throw new Unprintable()
    const named = columnLabel(column)
    return `[${named.tableName} -> ${named.name} -> #${row.rowNumber}]`
  }
  if (ref.tableId) {
    const column = catalog.columns.find((item) => item.columnId === ref.columnId && item.tableId === ref.tableId)
    if (!column) throw new Unprintable()
    const named = columnLabel(column)
    return `[${named.tableName} -> ${named.name}]`
  }
  const column = catalog.columns.find((item) => item.columnId === ref.columnId && item.tableId === catalog.tableId)
  if (!column || reserved(column.name)) throw new Unprintable()
  return `[${column.name}]`
}

function printRelation(node: Extract<AstNode, { type: 'call' }>, catalog: BracketCatalog) {
  if (node.name !== 'RELATION' || node.args.length !== 2) return null
  const [from, to] = node.args
  if (from.type !== 'ref' || to.type !== 'ref') return null
  const relation = catalog.relations.find((item) => item.columnId === from.ref.columnId)
  const field = relation?.fields.find((item) => item.columnId === to.ref.columnId)
  if (!relation || !field || reserved(relation.name) || reserved(field.name)) throw new Unprintable()
  return `[${relation.name} -> ${field.name}]`
}

function printNode(node: AstNode, parent: number, catalog: BracketCatalog): string {
  if (node.type === 'number') return String(node.value)
  if (node.type === 'string') return `"${node.value.replaceAll('"', '""')}"`
  if (node.type === 'bool') return node.value ? 'TRUE' : 'FALSE'
  if (node.type === 'it') return 'IT'
  if (node.type === 'ref') return printRef(node.ref, catalog)
  if (node.type === 'range') throw new Unprintable()
  if (node.type === 'unary') {
    const text = node.op === '-' ? `-${printNode(node.expr, 7, catalog)}` : `NOT ${printNode(node.expr, 7, catalog)}`
    return parent > 7 ? `(${text})` : text
  }
  if (node.type === 'binary') {
    const level = precedence(node.op)
    const text = `${printNode(node.left, level, catalog)} ${node.op} ${printNode(node.right, level + 1, catalog)}`
    return parent > level ? `(${text})` : text
  }
  const relation = printRelation(node, catalog)
  if (relation) return relation
  return `${node.name}(${node.args.map((arg) => printNode(arg, 0, catalog)).join(', ')})`
}

export function displayFormula(canonical: string, catalog: BracketCatalog) {
  try {
    return printNode(parseFormula(canonical), 0, catalog)
  } catch (error) {
    if (error instanceof Unprintable || error instanceof FormulaSyntaxError) return null
    throw error
  }
}
