export const LIMITS = {
  maxLength: 2000,
  maxDepth: 32,
  maxSteps: 10_000,
  maxDependencyDepth: 16,
  maxMillis: 50,
} as const

export type FormulaErrorCode = '#CYCLE' | '#REF' | '#VALUE' | '#DIV/0' | '#LIM' | '#N/A'

export type FormulaErrorValue = { error: FormulaErrorCode }

export type FormulaScalar = number | string | boolean | null

export type FormulaValue = FormulaScalar | FormulaErrorValue | FormulaValue[]

export type RefNode = {
  columnId: string
  rowId?: string
  tableId?: string
}

export type AstNode =
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'unary'; op: '-' | 'NOT'; expr: AstNode }
  | { type: 'binary'; op: string; left: AstNode; right: AstNode }
  | { type: 'call'; name: string; args: AstNode[] }
  | { type: 'ref'; ref: RefNode }
  | { type: 'range'; start: RefNode; end: RefNode }
  | { type: 'it' }

export function isFormulaError(value: unknown): value is FormulaErrorValue {
  return typeof value === 'object' && value !== null && 'error' in value && !Array.isArray(value)
}

export function astDepth(node: AstNode): number {
  switch (node.type) {
    case 'number':
    case 'string':
    case 'bool':
    case 'ref':
    case 'range':
    case 'it':
      return 1
    case 'unary':
      return 1 + astDepth(node.expr)
    case 'binary':
      return 1 + Math.max(astDepth(node.left), astDepth(node.right))
    case 'call':
      return 1 + node.args.reduce((max, arg) => Math.max(max, astDepth(arg)), 0)
  }
}

export function collectRefs(node: AstNode, into: RefNode[] = []): RefNode[] {
  switch (node.type) {
    case 'ref':
      into.push(node.ref)
      break
    case 'range':
      into.push(node.start, node.end)
      break
    case 'unary':
      collectRefs(node.expr, into)
      break
    case 'binary':
      collectRefs(node.left, into)
      collectRefs(node.right, into)
      break
    case 'call':
      node.args.forEach((arg) => collectRefs(arg, into))
      break
    default:
      break
  }
  return into
}
