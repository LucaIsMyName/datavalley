import { isFormulaError, type AstNode, type FormulaValue, type RefNode } from './ast.js'
import { parseFormula } from './parse.js'
import { runFormula, type EvalContext } from './eval.js'

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

function context(item: FormulaValue, values: Record<string, FormulaValue>): Omit<EvalContext, 'now'> {
  return {
    item,
    blankItem: true,
    condition: true,
    clock: () => new Date(),
    get: (ref: RefNode) => {
      if (ref.tableId || ref.rowId) return { error: '#REF' }
      return values[ref.columnId] ?? null
    },
    range: () => [{ error: '#N/A' }],
    lookup: () => ({ error: '#N/A' }),
    relation: () => ({ error: '#N/A' }),
    column: () => ({ error: '#VALUE' }),
  }
}

function conditionNodes(ast: AstNode): { nodes: AstNode[]; invert: boolean } {
  if (ast.type !== 'call') return { nodes: [ast], invert: false }
  if (ast.name === 'IF' && ast.args.length >= 1 && ast.args.length <= 3) return { nodes: [ast.args[0]], invert: false }
  if (ast.name === 'IFNOT' && ast.args.length >= 2 && ast.args.length <= 3) return { nodes: [ast.args[0]], invert: true }
  if (ast.name === 'IFS' && ast.args.length >= 2 && ast.args.length % 2 === 0) {
    return { nodes: ast.args.filter((_, index) => index % 2 === 0), invert: false }
  }
  return { nodes: [ast], invert: false }
}

export function matchesCondition(expression: string, item: FormulaValue, values: Record<string, FormulaValue>) {
  const ast = cached(expression)
  if (!ast) return false
  const { nodes, invert } = conditionNodes(ast)
  const ctx = context(item, values)
  if (invert) {
    const value = runFormula(nodes[0], ctx)
    if (isFormulaError(value) || Array.isArray(value)) return false
    return !isTrue(value)
  }
  return nodes.some((node) => isTrue(runFormula(node, ctx)))
}
