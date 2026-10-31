import { isFormulaError, type AstNode, type FormulaValue, type RefNode } from './ast.js'
import { parseFormula } from './parse.js'
import { runFormula } from './eval.js'

export type ConditionBlock = 'lookup' | 'relation' | 'column' | 'cell'

const parsed = new Map<string, AstNode | null>()

function cached(expression: string) {
  const key = expression.trim()
  if (parsed.has(key)) return parsed.get(key) ?? null
  if (parsed.size > 200) parsed.clear()
  try {
    const ast = parseFormula(key)
    parsed.set(key, ast)
    return ast
  } catch {
    parsed.set(key, null)
    return null
  }
}

export function conditionBlock(node: AstNode): ConditionBlock | null {
  if (node.type === 'call' && node.name === 'LOOKUP') return 'lookup'
  if (node.type === 'call' && node.name === 'RELATION') return 'relation'
  if (node.type === 'range') return 'column'
  if (node.type === 'ref' && node.ref.rowId) return 'cell'
  if (node.type === 'ref' && node.ref.tableId) return 'column'
  if (node.type === 'unary') return conditionBlock(node.expr)
  if (node.type === 'binary') return conditionBlock(node.left) ?? conditionBlock(node.right)
  if (node.type === 'call') {
    for (const arg of node.args) {
      const found = conditionBlock(arg)
      if (found) return found
    }
  }
  return null
}

function isTrue(value: FormulaValue) {
  if (isFormulaError(value) || Array.isArray(value)) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0
  if (typeof value === 'string') return value.length > 0
  return false
}

export function matchesCondition(expression: string, item: FormulaValue, values: Record<string, FormulaValue>) {
  const ast = cached(expression)
  if (!ast) return false
  const node = ast.type === 'call' && ast.name === 'IF' && ast.args.length === 1 ? ast.args[0] : ast
  const value = runFormula(node, {
    item,
    blankItem: true,
    clock: () => new Date(),
    get: (ref: RefNode) => {
      if (ref.tableId || ref.rowId) return { error: '#REF' }
      return values[ref.columnId] ?? null
    },
    range: () => [{ error: '#N/A' }],
    lookup: () => ({ error: '#N/A' }),
    relation: () => ({ error: '#N/A' }),
    column: () => ({ error: '#VALUE' }),
  })
  return isTrue(value)
}
