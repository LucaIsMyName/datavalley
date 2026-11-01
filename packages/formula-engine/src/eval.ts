import {
  LIMITS,
  isFormulaError,
  type AstNode,
  type FormulaErrorValue,
  type FormulaScalar,
  type FormulaValue,
  type RefNode,
} from './ast.js'

export type EvalContext = {
  now: () => number
  clock: () => Date
  get: (ref: RefNode) => FormulaValue
  range: (start: RefNode, end: RefNode) => FormulaValue[]
  lookup: (
    tableId: string,
    matchColumnId: string,
    needle: FormulaScalar,
    resultColumnId: string,
  ) => FormulaValue
  relation?: (fromColumnId: string, toColumnId: string) => FormulaValue
  column?: (ref: RefNode) => FormulaValue
  /** True when a SUMIF criteria column and numbers column are not the same table. */
  sumifTablesDiffer?: (criteria: RefNode, numbers: RefNode) => boolean
  item?: FormulaValue
  /** When set, a missing item is a blank cell. Normal formulas leave this unset, so `IT` stays `#VALUE`. */
  blankItem?: boolean
  /** When set, comparisons follow conditional-formatting rules. Normal formulas leave this unset. */
  condition?: boolean
}

function err(code: FormulaErrorValue['error']): FormulaErrorValue {
  return { error: code }
}

function flatten(values: FormulaValue[]): FormulaValue[] {
  const out: FormulaValue[] = []
  for (const value of values) {
    if (Array.isArray(value)) out.push(...flatten(value))
    else out.push(value)
  }
  return out
}

function firstError(values: FormulaValue[]): FormulaErrorValue | null {
  for (const value of values) {
    if (isFormulaError(value)) return value
  }
  return null
}

function asNumber(value: FormulaValue): number | FormulaErrorValue | null {
  if (isFormulaError(value)) return value
  if (Array.isArray(value)) return err('#VALUE')
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  if (value == null) return null
  return err('#VALUE')
}

function truthy(value: FormulaValue): boolean | FormulaErrorValue {
  if (isFormulaError(value)) return value
  if (Array.isArray(value)) return err('#VALUE')
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.length > 0
  return false
}

function asText(value: FormulaScalar): string {
  if (value == null) return ''
  return String(value)
}

export function evaluate(node: AstNode, ctx: EvalContext, depth = 0): FormulaValue {
  if (depth > LIMITS.maxDependencyDepth) return err('#LIM')
  if (ctx.now() - startOf(ctx) > LIMITS.maxMillis) return err('#LIM')
  steps(ctx)
  switch (node.type) {
    case 'number':
    case 'string':
      return node.value
    case 'bool':
      return node.value
    case 'unary': {
      const value = evaluate(node.expr, ctx, depth)
      if (isFormulaError(value)) return value
      if (node.op === 'NOT') {
        const flag = truthy(value)
        return isFormulaError(flag) ? flag : !flag
      }
      const numeric = asNumber(value)
      if (numeric == null) return 0
      if (isFormulaError(numeric)) return numeric
      return -numeric
    }
    case 'binary':
      return evalBinary(node.op, node.left, node.right, ctx, depth)
    case 'call':
      return evalCall(node.name, node.args, ctx, depth)
    case 'ref':
      return ctx.get(node.ref)
    case 'range':
      return ctx.range(node.start, node.end)
    case 'it':
      if (ctx.item == null) return ctx.blankItem ? null : err('#VALUE')
      return ctx.item
  }
}

const started = new WeakMap<EvalContext, number>()
const counted = new WeakMap<EvalContext, number>()

function startOf(ctx: EvalContext): number {
  let value = started.get(ctx)
  if (value == null) {
    value = ctx.now()
    started.set(ctx, value)
  }
  return value
}

function steps(ctx: EvalContext) {
  const next = (counted.get(ctx) ?? 0) + 1
  counted.set(ctx, next)
  if (next > LIMITS.maxSteps) throw Object.assign(new Error('step limit'), { code: '#LIM' })
}

function evalBinary(op: string, leftNode: AstNode, rightNode: AstNode, ctx: EvalContext, depth: number): FormulaValue {
  if (op === 'AND' || op === 'OR') {
    const left = evaluate(leftNode, ctx, depth)
    if (isFormulaError(left)) return left
    const leftFlag = truthy(left)
    if (isFormulaError(leftFlag)) return leftFlag
    if (op === 'AND' && !leftFlag) return false
    if (op === 'OR' && leftFlag) return true
    const right = evaluate(rightNode, ctx, depth)
    if (isFormulaError(right)) return right
    const rightFlag = truthy(right)
    return isFormulaError(rightFlag) ? rightFlag : rightFlag
  }
  const left = evaluate(leftNode, ctx, depth)
  const right = evaluate(rightNode, ctx, depth)
  if (isFormulaError(left)) return left
  if (isFormulaError(right)) return right
  if (op === '&') {
    if (Array.isArray(left) || Array.isArray(right)) return err('#VALUE')
    return asText(left) + asText(right)
  }
  if (['>', '<', '>=', '<=', '=', '<>'].includes(op)) {
    if (ctx.condition) {
      const relaxed = conditionCompare(op, left, right)
      if (relaxed != null) return relaxed
    }
    return compare(op, left, right)
  }
  const a = asNumber(left)
  const b = asNumber(right)
  if (isFormulaError(a)) return a
  if (isFormulaError(b)) return b
  const leftNumber = a ?? 0
  const rightNumber = b ?? 0
  if ((op === '/' || op === '%') && rightNumber === 0) return err('#DIV/0')
  if (op === '+') return leftNumber + rightNumber
  if (op === '-') return leftNumber - rightNumber
  if (op === '*') return leftNumber * rightNumber
  if (op === '/') return leftNumber / rightNumber
  if (op === '%') return leftNumber % rightNumber
  return err('#VALUE')
}

function numericText(value: FormulaValue) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

function conditionCompare(op: string, left: FormulaValue, right: FormulaValue): FormulaValue | null {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (op !== '=' && op !== '<>') return err('#VALUE')
    if (Array.isArray(left) && Array.isArray(right)) return err('#VALUE')
    const list = (Array.isArray(left) ? left : right) as FormulaValue[]
    const scalar = Array.isArray(left) ? right : left
    if (isFormulaError(scalar) || Array.isArray(scalar)) return err('#VALUE')
    const needle = scalar == null ? '' : String(scalar).toLowerCase()
    const hit = list.some((item) => {
      if (isFormulaError(item) || Array.isArray(item) || item == null) return false
      return String(item).toLowerCase() === needle
    })
    return op === '=' ? hit : !hit
  }
  const leftBlank = left == null || left === ''
  const rightBlank = right == null || right === ''
  if ((op === '=' || op === '<>') && leftBlank && rightBlank) return op === '='
  if ((op === '=' || op === '<>') && typeof left === 'string' && typeof right === 'string') {
    const equal = left.toLowerCase() === right.toLowerCase()
    return op === '=' ? equal : !equal
  }
  const leftNumber = typeof left === 'number' && Number.isFinite(left) ? left : numericText(left)
  const rightNumber = typeof right === 'number' && Number.isFinite(right) ? right : numericText(right)
  const mixed = typeof left === 'number' ? typeof right !== 'number' : typeof right === 'number'
  if (mixed && leftNumber != null && rightNumber != null) {
    if (op === '=') return leftNumber === rightNumber
    if (op === '<>') return leftNumber !== rightNumber
    if (op === '>') return leftNumber > rightNumber
    if (op === '<') return leftNumber < rightNumber
    if (op === '>=') return leftNumber >= rightNumber
    if (op === '<=') return leftNumber <= rightNumber
  }
  return null
}

function compare(op: string, left: FormulaValue, right: FormulaValue): FormulaValue {
  if (Array.isArray(left) || Array.isArray(right)) return err('#VALUE')
  if (op === '=' || op === '<>') {
    const same = left === right || (typeof left === 'number' && typeof right === 'number' && left === right)
    const equal = same || (left == null && right == null)
    const loosely = typeof left === typeof right && left === right
    const result = loosely || equal
    return op === '=' ? result : !result
  }
  if (typeof left === 'number' && typeof right === 'number') {
    if (op === '>') return left > right
    if (op === '<') return left < right
    if (op === '>=') return left >= right
    if (op === '<=') return left <= right
  }
  if (typeof left === 'string' && typeof right === 'string') {
    if (op === '>') return left > right
    if (op === '<') return left < right
    if (op === '>=') return left >= right
    if (op === '<=') return left <= right
  }
  return err('#VALUE')
}

function valuesEqual(left: FormulaValue, right: FormulaValue) {
  if (isFormulaError(left) || isFormulaError(right) || Array.isArray(left) || Array.isArray(right)) return false
  if (left == null && right == null) return true
  if (typeof left === 'string' && typeof right === 'string') return left.toLowerCase() === right.toLowerCase()
  return left === right
}

export function matchesCriterion(item: FormulaValue, condition: FormulaValue) {
  if (valuesEqual(item, condition)) return true
  if (!Array.isArray(item) || Array.isArray(condition) || isFormulaError(condition)) return false
  return item.some((entry) => valuesEqual(entry, condition))
}

function dateOf(value: FormulaScalar | null) {
  if (typeof value !== 'string' || value.trim() === '') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`)
    return Number.isNaN(date.getTime()) ? null : date
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function columnValue(node: AstNode | undefined, ctx: EvalContext, depth: number): FormulaValue {
  if (!node) return err('#VALUE')
  if (node.type === 'ref' && ctx.column) return ctx.column(node.ref)
  return evaluate(node, ctx, depth)
}

function evalCall(name: string, args: AstNode[], ctx: EvalContext, depth: number): FormulaValue {
  try {
    if (name === 'IF') {
      if (args.length < 2 || args.length > 3) return err('#VALUE')
      const condition = evaluate(args[0], ctx, depth)
      if (isFormulaError(condition)) return condition
      const flag = truthy(condition)
      if (isFormulaError(flag)) return flag
      if (flag) return evaluate(args[1], ctx, depth)
      return args[2] ? evaluate(args[2], ctx, depth) : false
    }
    if (name === 'AND' || name === 'OR') {
      let seed = name === 'AND'
      for (const arg of args) {
        const value = evaluate(arg, ctx, depth)
        const flat = flatten([value])
        const error = firstError(flat)
        if (error) return error
        for (const item of flat) {
          const flag = truthy(item)
          if (isFormulaError(flag)) return flag
          if (name === 'AND' && !flag) return false
          if (name === 'OR' && flag) return true
          seed = flag
        }
      }
      return seed
    }
    if (name === 'NOT') {
      if (args.length !== 1) return err('#VALUE')
      const value = evaluate(args[0], ctx, depth)
      if (isFormulaError(value)) return value
      const flag = truthy(value)
      return isFormulaError(flag) ? flag : !flag
    }
    if (name === 'IFNOT') {
      if (args.length < 2 || args.length > 3) return err('#VALUE')
      const condition = evaluate(args[0], ctx, depth)
      if (isFormulaError(condition)) return condition
      const flag = truthy(condition)
      if (isFormulaError(flag)) return flag
      if (!flag) return evaluate(args[1], ctx, depth)
      return args[2] ? evaluate(args[2], ctx, depth) : false
    }
    if (name === 'IFS') {
      if (args.length < 2 || args.length % 2 !== 0) return err('#VALUE')
      for (let index = 0; index < args.length; index += 2) {
        const condition = evaluate(args[index], ctx, depth)
        if (isFormulaError(condition)) return condition
        const flag = truthy(condition)
        if (isFormulaError(flag)) return flag
        if (flag) return evaluate(args[index + 1], ctx, depth)
      }
      return err('#N/A')
    }
    if (name === 'FOR') {
      if (args.length !== 2) return err('#VALUE')
      const list = evaluate(args[0], ctx, depth)
      if (isFormulaError(list)) return list
      const items = Array.isArray(list) ? list : [list]
      const previous = ctx.item
      const out: FormulaValue[] = []
      for (const item of items) {
        ctx.item = item
        out.push(evaluate(args[1], ctx, depth))
      }
      ctx.item = previous
      return out
    }
    if (name === 'ISBLANK') {
      if (args.length !== 1) return err('#VALUE')
      const value = evaluate(args[0], ctx, depth)
      if (isFormulaError(value)) return value
      if (value == null || value === '') return true
      return Array.isArray(value) && value.length === 0
    }
    if (name === 'CONTAINS') {
      if (args.length !== 2) return err('#VALUE')
      const value = evaluate(args[0], ctx, depth)
      const part = evaluate(args[1], ctx, depth)
      if (isFormulaError(value)) return value
      if (isFormulaError(part)) return part
      if (Array.isArray(part)) return err('#VALUE')
      if (typeof value === 'string') return value.toLowerCase().includes(asText(part ?? null).toLowerCase())
      if (Array.isArray(value)) {
        const needle = asText(part ?? null).toLowerCase()
        return value.some((item) => !isFormulaError(item) && !Array.isArray(item) && asText(item ?? null).toLowerCase() === needle)
      }
      return false
    }
    if (name === 'COUNTIF') {
      if (args.length !== 2) return err('#VALUE')
      const list = columnValue(args[0], ctx, depth)
      const condition = evaluate(args[1], ctx, depth)
      if (isFormulaError(list)) return list
      if (isFormulaError(condition)) return condition
      const items = Array.isArray(list) ? list : [list]
      return items.filter((item) => matchesCriterion(item, condition)).length
    }
    if (name === 'SUMIF') {
      if (args.length !== 3) return err('#VALUE')
      if (
        args[0]?.type === 'ref' &&
        args[2]?.type === 'ref' &&
        ctx.sumifTablesDiffer?.(args[0].ref, args[2].ref)
      ) {
        return err('#VALUE')
      }
      const list = columnValue(args[0], ctx, depth)
      const condition = evaluate(args[1], ctx, depth)
      const numbers = columnValue(args[2], ctx, depth)
      if (isFormulaError(list)) return list
      if (isFormulaError(condition)) return condition
      if (isFormulaError(numbers)) return numbers
      const criteria = Array.isArray(list) ? list : [list]
      const amounts = Array.isArray(numbers) ? numbers : [numbers]
      let sum = 0
      criteria.forEach((item, index) => {
        if (!matchesCriterion(item, condition)) return
        const numeric = asNumber(amounts[index] ?? null)
        if (typeof numeric === 'number') sum += numeric
      })
      return sum
    }
    if (name === 'YEAR' || name === 'MONTH' || name === 'DAY') {
      if (args.length !== 1) return err('#VALUE')
      const value = evaluate(args[0], ctx, depth)
      if (isFormulaError(value) || Array.isArray(value)) return isFormulaError(value) ? value : err('#VALUE')
      const date = dateOf(value)
      if (!date) return err('#VALUE')
      if (name === 'YEAR') return date.getUTCFullYear()
      if (name === 'MONTH') return date.getUTCMonth() + 1
      return date.getUTCDate()
    }
    if (name === 'RELATION') {
      if (args.length !== 2) return err('#VALUE')
      const from = args[0]
      const to = args[1]
      if (from.type !== 'ref' || to.type !== 'ref') return err('#VALUE')
      if (!ctx.relation) return err('#N/A')
      return ctx.relation(from.ref.columnId, to.ref.columnId)
    }
    if (name === 'LOOKUP') {
      if (args.length !== 3) return err('#VALUE')
      const match = args[0]
      const result = args[2]
      if (match.type !== 'ref' || !match.ref.tableId || result.type !== 'ref' || !result.ref.tableId) return err('#VALUE')
      const needle = evaluate(args[1], ctx, depth)
      if (isFormulaError(needle) || Array.isArray(needle)) return isFormulaError(needle) ? needle : err('#VALUE')
      return ctx.lookup(match.ref.tableId, match.ref.columnId, needle, result.ref.columnId)
    }
    const evaluated = args.map((arg) => evaluate(arg, ctx, depth))
    const flat = flatten(evaluated)
    const error = firstError(flat)
    if (error && !['SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'COUNTA'].includes(name)) return error
    if (name === 'SUM' || name === 'AVERAGE' || name === 'MIN' || name === 'MAX' || name === 'COUNT' || name === 'COUNTA') {
      if (error) return error
      const numbers = flat.filter((value): value is number => typeof value === 'number')
      if (name === 'COUNT') return numbers.length
      if (name === 'COUNTA') return flat.filter((value) => value != null && value !== '').length
      if (name === 'SUM') return numbers.reduce((sum, value) => sum + value, 0)
      if (name === 'AVERAGE') {
        if (numbers.length === 0) return err('#DIV/0')
        return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
      }
      if (numbers.length === 0) return 0
      return name === 'MIN' ? Math.min(...numbers) : Math.max(...numbers)
    }
    if (error) return error
    if (name === 'ROUND' || name === 'ABS') {
      const numeric = asNumber(flat[0] ?? null)
      if (numeric == null || isFormulaError(numeric)) return numeric ?? err('#VALUE')
      if (name === 'ABS') return Math.abs(numeric)
      const digits = args.length > 1 ? asNumber(flat[1] ?? 0) : 0
      if (digits == null || isFormulaError(digits)) return digits ?? err('#VALUE')
      if (!Number.isInteger(digits) || digits < 0 || digits > 10) return err('#VALUE')
      const factor = 10 ** digits
      return Math.round(numeric * factor) / factor
    }
    if (name === 'CONCAT') {
      return flat.map((value) => (Array.isArray(value) || isFormulaError(value) ? '' : asText(value))).join('')
    }
    if (name === 'LEFT' || name === 'RIGHT' || name === 'LEN' || name === 'LOWER' || name === 'UPPER') {
      const scalar = flat[0]
      if (isFormulaError(scalar) || Array.isArray(scalar)) return err('#VALUE')
      const text = asText(scalar ?? null)
      if (name === 'LEN') return text.length
      if (name === 'LOWER') return text.toLowerCase()
      if (name === 'UPPER') return text.toUpperCase()
      const count = args.length > 1 ? asNumber(flat[1] ?? 1) : 1
      if (count == null || isFormulaError(count) || count < 0) return err('#VALUE')
      return name === 'LEFT' ? text.slice(0, count) : text.slice(Math.max(0, text.length - count))
    }
    if (name === 'TODAY') return ctx.clock().toISOString().slice(0, 10)
    if (name === 'NOW') return ctx.clock().toISOString()
    return err('#VALUE')
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '#LIM') return err('#LIM')
    throw error
  }
}

export function runFormula(node: AstNode, ctx: Omit<EvalContext, 'now'> & { now?: () => number }): FormulaValue {
  const full: EvalContext = { ...ctx, now: ctx.now ?? (() => Date.now()) }
  try {
    return evaluate(node, full)
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '#LIM') return err('#LIM')
    throw error
  }
}
