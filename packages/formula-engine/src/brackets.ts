import type { AstNode, FormulaDeclaration, RefNode } from './ast.js'
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

function currentRowRef(ref: RefNode, tableId: string, keepColumn: boolean, mark: () => void) {
  if (keepColumn || ref.rowId || ref.tableId !== tableId) return ref
  mark()
  return { columnId: ref.columnId }
}

function mapProgram(node: Extract<AstNode, { type: 'program' }>, visit: (child: AstNode) => AstNode): AstNode {
  const declarations: FormulaDeclaration[] = node.declarations.map((declaration) => {
    if (declaration.kind === 'var') {
      const expr = visit(declaration.binding.expr)
      return expr === declaration.binding.expr ? declaration : { kind: 'var', binding: { ...declaration.binding, expr } }
    }
    const params = declaration.fn.params.map((param) => {
      if (!param.fallback) return param
      const fallback = visit(param.fallback)
      return fallback === param.fallback ? param : { ...param, fallback }
    })
    const locals = declaration.fn.locals.map((local) => {
      const expr = visit(local.expr)
      return expr === local.expr ? local : { ...local, expr }
    })
    const body = visit(declaration.fn.body)
    const sameParams = params.every((param, index) => param === declaration.fn.params[index])
    const sameLocals = locals.every((local, index) => local === declaration.fn.locals[index])
    if (sameParams && sameLocals && body === declaration.fn.body) return declaration
    return { kind: 'function', fn: { ...declaration.fn, params, locals, body } }
  })
  const body = visit(node.body)
  const same = body === node.body && declarations.every((item, index) => item === node.declarations[index])
  return same ? node : { type: 'program', declarations, body }
}

function printProgram(node: Extract<AstNode, { type: 'program' }>, print: (child: AstNode) => string) {
  const lines = node.declarations.map((declaration) => {
    if (declaration.kind === 'var') return `VAR ${declaration.binding.name} = ${print(declaration.binding.expr)};`
    const params = declaration.fn.params
      .map((param) => (param.fallback ? `${param.name} = ${print(param.fallback)}` : param.name))
      .join(', ')
    const locals = declaration.fn.locals.map((local) => `VAR ${local.name} = ${print(local.expr)};`)
    return `FUNCTION ${declaration.fn.name}(${params}) = {\n${[...locals, `RETURN ${print(declaration.fn.body)}`].join('\n')}\n}`
  })
  return [...lines, print(node.body)].join('\n')
}

function firstRef(node: Extract<AstNode, { type: 'program' }>, visit: (child: AstNode) => RefNode | null) {
  for (const declaration of node.declarations) {
    if (declaration.kind === 'var') {
      const found = visit(declaration.binding.expr)
      if (found) return found
      continue
    }
    for (const param of declaration.fn.params) {
      if (!param.fallback) continue
      const found = visit(param.fallback)
      if (found) return found
    }
    for (const local of declaration.fn.locals) {
      const found = visit(local.expr)
      if (found) return found
    }
    const found = visit(declaration.fn.body)
    if (found) return found
  }
  return visit(node.body)
}

function currentRowNode(node: AstNode, tableId: string, keepColumn: boolean, mark: () => void): AstNode {
  if (node.type === 'ref') {
    const ref = currentRowRef(node.ref, tableId, keepColumn, mark)
    return ref === node.ref ? node : { type: 'ref', ref }
  }
  if (
    node.type === 'range' ||
    node.type === 'number' ||
    node.type === 'string' ||
    node.type === 'bool' ||
    node.type === 'it' ||
    node.type === 'var' ||
    node.type === 'param' ||
    node.type === 'omit'
  ) {
    return node
  }
  if (node.type === 'program') return mapProgram(node, (child) => currentRowNode(child, tableId, keepColumn, mark))
  if (node.type === 'unary') {
    const expr = currentRowNode(node.expr, tableId, keepColumn, mark)
    return expr === node.expr ? node : { ...node, expr }
  }
  if (node.type === 'binary') {
    const left = currentRowNode(node.left, tableId, keepColumn, mark)
    const right = currentRowNode(node.right, tableId, keepColumn, mark)
    return left === node.left && right === node.right ? node : { ...node, left, right }
  }
  if (node.type !== 'call') return node
  if (node.name === 'RELATION') return node
  const args = node.args.map((arg, index) => {
    if (node.name === 'LOOKUP') return currentRowNode(arg, tableId, index === 0 || index === 2, mark)
    if (AGGREGATES.has(node.name) && (arg.type === 'ref' || arg.type === 'range')) return currentRowNode(arg, tableId, true, mark)
    return currentRowNode(arg, tableId, false, mark)
  })
  return args.every((arg, index) => arg === node.args[index]) ? node : { ...node, args }
}

function printCanonicalRef(ref: RefNode) {
  const column = ref.tableId ? `{${ref.tableId}}.{${ref.columnId}}` : `{${ref.columnId}}`
  return ref.rowId ? `${column}@{${ref.rowId}}` : column
}

function printCanonical(node: AstNode, parent = 0): string {
  if (node.type === 'number') return String(node.value)
  if (node.type === 'string') return `"${node.value.replaceAll('"', '""')}"`
  if (node.type === 'bool') return node.value ? 'TRUE' : 'FALSE'
  if (node.type === 'it') return 'IT'
  if (node.type === 'ref') return printCanonicalRef(node.ref)
  if (node.type === 'range') return `${printCanonicalRef(node.start)}:${printCanonicalRef(node.end)}`
  if (node.type === 'unary') {
    const text = node.op === '-' ? `-${printCanonical(node.expr, 7)}` : `NOT ${printCanonical(node.expr, 7)}`
    return parent > 7 ? `(${text})` : text
  }
  if (node.type === 'binary') {
    const level = precedence(node.op)
    const text = `${printCanonical(node.left, level)} ${node.op} ${printCanonical(node.right, level + 1)}`
    return parent > level ? `(${text})` : text
  }
  if (node.type === 'var') return `$${node.name}`
  if (node.type === 'param') return `$${node.name}`
  if (node.type === 'omit') return '_'
  if (node.type === 'program') return printProgram(node, printCanonical)
  if (node.type !== 'call') return ''
  return `${node.name}(${node.args.map((arg) => printCanonical(arg)).join(', ')})`
}

export function ownRowFormula(expression: string, tableId: string) {
  const ast = parseFormula(expression)
  let changed = false
  const next = currentRowNode(ast, tableId, false, () => {
    changed = true
  })
  if (!changed) return expression
  const source = printCanonical(next)
  parseFormula(source)
  return source
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
  if (node.type === 'program') return firstRef(node, bareColumn)
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
  if (node.type === 'program') return firstRef(node, walkMath)
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
  if (node.type === 'var') return `$${node.name}`
  if (node.type === 'param') return `$${node.name}`
  if (node.type === 'omit') return '_'
  if (node.type === 'program') return printProgram(node, (child) => printNode(child, 0, catalog))
  if (node.type !== 'call') return ''
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
