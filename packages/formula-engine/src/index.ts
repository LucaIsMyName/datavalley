export { LIMITS, astDepth, collectRefs, isFormulaError } from './ast.js'
export type { AstNode, FormulaErrorValue, FormulaScalar, FormulaValue, RefNode } from './ast.js'
export { FormulaLimitError, FormulaSyntaxError, parseFormula } from './parse.js'
export { bracketRowAsks, displayFormula, ownRowFormula, resolveBrackets, wholeColumnInMath } from './brackets.js'
export type { BracketCatalog, BracketColumn, BracketRelation, BracketRow } from './brackets.js'
export { matchesCriterion, runFormula } from './eval.js'
export type { EvalContext } from './eval.js'
export { conditionBlock, matchesCondition } from './condition.js'
export type { ConditionBlock } from './condition.js'

import type { RefNode } from './ast.js'
import { parseFormula } from './parse.js'

export type NameBinding = {
  names: Record<string, RefNode>
}

export function canonicalize(expression: string, names: Record<string, RefNode>): string {
  const entries = Object.entries(names).sort((a, b) => b[0].length - a[0].length)
  const source = expression.trim().replace(/^=/, '')
  const hidden = hiddenRanges(source)
  const kept = protectedNames(source)
  const hits: { start: number; end: number; text: string }[] = []
  for (const [name, ref] of entries) {
    const column = ref.tableId ? `{${ref.tableId}}.{${ref.columnId}}` : `{${ref.columnId}}`
    const token = ref.rowId ? `${column}@{${ref.rowId}}` : column
    const pattern = new RegExp(`(?<![A-Za-z0-9_$])${escapeRegExp(name)}(?![A-Za-z0-9_])`, 'g')
    for (const match of source.matchAll(pattern)) {
      const start = match.index
      if (start == null) continue
      if (hidden.some((range) => start >= range.from && start < range.to)) continue
      if (kept.some((range) => start >= range.from && start < range.to)) continue
      hits.push({ start, end: start + name.length, text: token })
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end)
  let rewritten = ''
  let cursor = 0
  for (const hit of hits) {
    if (hit.start < cursor) continue
    rewritten += source.slice(cursor, hit.start) + hit.text
    cursor = hit.end
  }
  rewritten += source.slice(cursor)
  parseFormula(rewritten)
  return rewritten
}

function hiddenRanges(source: string) {
  const ranges: { from: number; to: number }[] = []
  let index = 0
  while (index < source.length) {
    if (source[index] !== '"') {
      index += 1
      continue
    }
    const start = index
    index += 1
    while (index < source.length) {
      if (source[index] === '"') {
        if (source[index + 1] === '"') {
          index += 2
          continue
        }
        index += 1
        break
      }
      index += 1
    }
    ranges.push({ from: start, to: index })
  }
  return ranges
}

function protectedNames(source: string) {
  const ranges: { from: number; to: number }[] = []
  const functions: string[] = []
  let index = 0
  while (index < source.length) {
    if (source[index] === '"') {
      index = skipQuoted(source, index)
      continue
    }
    if (/\s/.test(source[index] ?? '')) {
      index += 1
      continue
    }
    const word = identifierAt(source, index)
    if (!word) {
      index += 1
      continue
    }
    const upper = word.toUpperCase()
    if (upper === 'VAR') {
      const nameAt = skipSpace(source, index + word.length)
      const name = identifierAt(source, nameAt)
      if (name) ranges.push({ from: nameAt, to: nameAt + name.length })
      index += word.length
      continue
    }
    if (upper === 'FUNCTION') {
      const nameAt = skipSpace(source, index + word.length)
      const name = identifierAt(source, nameAt)
      if (!name) {
        index += word.length
        continue
      }
      ranges.push({ from: nameAt, to: nameAt + name.length })
      functions.push(name)
      index = protectFunction(source, nameAt + name.length, ranges, functions)
      continue
    }
    if (functions.includes(word)) {
      const after = skipSpace(source, index + word.length)
      if (source[after] === '(') ranges.push({ from: index, to: index + word.length })
    }
    index += word.length
  }
  return ranges
}

function protectFunction(source: string, start: number, ranges: { from: number; to: number }[], functions: string[]) {
  let index = skipSpace(source, start)
  if (source[index] !== '(') return index
  index += 1
  const params: string[] = []
  while (index < source.length && source[index] !== ')') {
    index = skipSpace(source, index)
    if (source[index] === ')') break
    const name = identifierAt(source, index)
    if (!name) break
    ranges.push({ from: index, to: index + name.length })
    params.push(name)
    index = skipSpace(source, index + name.length)
    if (source[index] === '=') {
      index = skipSpace(source, skipDefault(source, index + 1))
      if (source[index] === ',') index += 1
      continue
    }
    if (source[index] === ',') index += 1
  }
  if (source[index] === ')') index += 1
  index = skipSpace(source, index)
  if (source[index] === '=') index += 1
  index = skipSpace(source, index)
  if (source[index] !== '{') return index
  return protectBody(source, index + 1, params, ranges, functions)
}

function protectBody(
  source: string,
  start: number,
  params: string[],
  ranges: { from: number; to: number }[],
  functions: string[],
) {
  let index = start
  let depth = 1
  while (index < source.length && depth > 0) {
    if (source[index] === '"') {
      index = skipQuoted(source, index)
      continue
    }
    if (source[index] === '{') {
      const ref = source.slice(index).match(/^\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}(?:\.\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\})?(?:@\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\})?/)
      if (ref) {
        index += ref[0].length
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
    if (/\s/.test(source[index] ?? '')) {
      index += 1
      continue
    }
    const word = identifierAt(source, index)
    if (!word) {
      index += 1
      continue
    }
    const upper = word.toUpperCase()
    if (upper === 'VAR') {
      const nameAt = skipSpace(source, index + word.length)
      const name = identifierAt(source, nameAt)
      if (name) ranges.push({ from: nameAt, to: nameAt + name.length })
      index += word.length
      continue
    }
    const after = skipSpace(source, index + word.length)
    if (params.includes(word) && source[after] !== '(') ranges.push({ from: index, to: index + word.length })
    if (functions.includes(word) && source[after] === '(') ranges.push({ from: index, to: index + word.length })
    index += word.length
  }
  return index
}

function skipDefault(source: string, start: number) {
  let index = start
  let depth = 0
  while (index < source.length) {
    if (source[index] === '"') {
      index = skipQuoted(source, index)
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

function identifierAt(source: string, index: number) {
  const match = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/)
  return match?.[0] ?? ''
}

function skipSpace(source: string, index: number) {
  let next = index
  while (next < source.length && /\s/.test(source[next] ?? '')) next += 1
  return next
}

function skipQuoted(source: string, index: number) {
  let next = index + 1
  while (next < source.length) {
    if (source[next] === '"') {
      if (source[next + 1] === '"') {
        next += 2
        continue
      }
      return next + 1
    }
    next += 1
  }
  return source.length
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
