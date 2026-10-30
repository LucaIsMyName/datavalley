export { LIMITS, astDepth, collectRefs, isFormulaError } from './ast.js'
export type { AstNode, FormulaErrorValue, FormulaScalar, FormulaValue, RefNode } from './ast.js'
export { FormulaLimitError, FormulaSyntaxError, parseFormula } from './parse.js'
export { runFormula } from './eval.js'
export type { EvalContext } from './eval.js'

import type { RefNode } from './ast.js'
import { parseFormula } from './parse.js'

export type NameBinding = {
  names: Record<string, RefNode>
}

export function canonicalize(expression: string, names: Record<string, RefNode>): string {
  const entries = Object.entries(names).sort((a, b) => b[0].length - a[0].length)
  let source = expression.trim().replace(/^=/, '')
  for (const [name, ref] of entries) {
    const token = ref.tableId
      ? `{${ref.tableId}}.{${ref.columnId}}`
      : ref.rowId
        ? `{${ref.columnId}}@{${ref.rowId}}`
        : `{${ref.columnId}}`
    source = source.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'g'), token)
  }
  parseFormula(source)
  return source
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
