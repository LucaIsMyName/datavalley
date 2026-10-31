export { LIMITS, astDepth, collectRefs, isFormulaError } from './ast.js'
export type { AstNode, FormulaErrorValue, FormulaScalar, FormulaValue, RefNode } from './ast.js'
export { FormulaLimitError, FormulaSyntaxError, parseFormula } from './parse.js'
export { bracketRowAsks, displayFormula, resolveBrackets, wholeColumnInMath } from './brackets.js'
export type { BracketCatalog, BracketColumn, BracketRelation, BracketRow } from './brackets.js'
export { runFormula } from './eval.js'
export type { EvalContext } from './eval.js'

import type { RefNode } from './ast.js'
import { parseFormula } from './parse.js'

export type NameBinding = {
  names: Record<string, RefNode>
}

export function canonicalize(expression: string, names: Record<string, RefNode>): string {
  const entries = Object.entries(names).sort((a, b) => b[0].length - a[0].length)
  const source = outsideQuotes(expression.trim().replace(/^=/, ''), (code) => {
    let next = code
    for (const [name, ref] of entries) {
      const column = ref.tableId ? `{${ref.tableId}}.{${ref.columnId}}` : `{${ref.columnId}}`
      const token = ref.rowId ? `${column}@{${ref.rowId}}` : column
      next = next.replace(new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(name)}(?![A-Za-z0-9_])`, 'g'), token)
    }
    return next
  })
  parseFormula(source)
  return source
}

function outsideQuotes(source: string, edit: (code: string) => string) {
  let result = ''
  let index = 0
  while (index < source.length) {
    if (source[index] === '"') {
      let end = index + 1
      while (end < source.length) {
        if (source[end] === '"') {
          if (source[end + 1] === '"') {
            end += 2
            continue
          }
          end += 1
          break
        }
        end += 1
      }
      result += source.slice(index, end)
      index = end
      continue
    }
    const next = source.indexOf('"', index)
    const end = next === -1 ? source.length : next
    result += edit(source.slice(index, end))
    index = end
  }
  return result
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
