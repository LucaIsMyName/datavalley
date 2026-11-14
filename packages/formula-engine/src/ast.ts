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

export const BUILTIN_FUNCTIONS = new Set([
  'SUM',
  'AVERAGE',
  'MIN',
  'MAX',
  'COUNT',
  'COUNTA',
  'ROUND',
  'ABS',
  'IF',
  'IFNOT',
  'IFS',
  'FOR',
  'AND',
  'OR',
  'NOT',
  'ISBLANK',
  'CONTAINS',
  'COUNTIF',
  'SUMIF',
  'YEAR',
  'MONTH',
  'DAY',
  'CONCAT',
  'LEFT',
  'RIGHT',
  'LEN',
  'LOWER',
  'UPPER',
  'TODAY',
  'NOW',
  'LOOKUP',
  'RELATION',
])

export type FormulaParam = {
  name: string
  fallback?: AstNode
}

export type FormulaBinding = {
  name: string
  expr: AstNode
}

export type FormulaFunction = {
  name: string
  params: FormulaParam[]
  locals: FormulaBinding[]
  body: AstNode
}

export type FormulaDeclaration =
  | { kind: 'var'; binding: FormulaBinding }
  | { kind: 'function'; fn: FormulaFunction }

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
  | { type: 'var'; name: string }
  | { type: 'param'; name: string }
  | { type: 'omit' }
  | { type: 'program'; declarations: FormulaDeclaration[]; body: AstNode }

export function isFormulaError(value: unknown): value is FormulaErrorValue {
  return typeof value === 'object' && value !== null && 'error' in value && !Array.isArray(value)
}

function nested(node: AstNode): AstNode[] {
  switch (node.type) {
    case 'unary':
      return [node.expr]
    case 'binary':
      return [node.left, node.right]
    case 'call':
      return node.args
    case 'program': {
      const nodes: AstNode[] = []
      for (const declaration of node.declarations) {
        if (declaration.kind === 'var') nodes.push(declaration.binding.expr)
        else {
          for (const param of declaration.fn.params) {
            if (param.fallback) nodes.push(param.fallback)
          }
          for (const local of declaration.fn.locals) nodes.push(local.expr)
          nodes.push(declaration.fn.body)
        }
      }
      nodes.push(node.body)
      return nodes
    }
    default:
      return []
  }
}

export function astDepth(node: AstNode): number {
  const children = nested(node)
  if (children.length === 0) return 1
  return 1 + children.reduce((max, child) => Math.max(max, astDepth(child)), 0)
}

export function collectRefs(node: AstNode, into: RefNode[] = []): RefNode[] {
  if (node.type === 'ref') into.push(node.ref)
  if (node.type === 'range') into.push(node.start, node.end)
  for (const child of nested(node)) collectRefs(child, into)
  return into
}
