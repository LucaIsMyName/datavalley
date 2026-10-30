import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { collectRefs, parseFormula, runFormula, canonicalize } from './index.js'
import type { EvalContext, FormulaValue, RefNode } from './index.js'

const column = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const table = '33333333-3333-4333-8333-333333333333'

function ctx(values: Record<string, FormulaValue>, extra: Partial<EvalContext> = {}): Omit<EvalContext, 'now'> {
  return {
    clock: () => new Date('2026-01-02T03:04:05.000Z'),
    get: (ref: RefNode) => values[ref.columnId] ?? { error: '#REF' },
    range: () => [],
    lookup: () => ({ error: '#N/A' }),
    ...extra,
  }
}

function run(expression: string, values: Record<string, FormulaValue> = {}, extra: Partial<EvalContext> = {}) {
  return runFormula(parseFormula(expression), ctx(values, extra))
}

describe('formula engine', () => {
  it('does not evaluate formulas with the JavaScript interpreter', () => {
    const source = [
      readFileSync(new URL('./parse.ts', import.meta.url), 'utf8'),
      readFileSync(new URL('./eval.ts', import.meta.url), 'utf8'),
    ].join('\n')
    expect(source.includes('eval(')).toBe(false)
    expect(source.includes('new Function')).toBe(false)
  })

  it('respects operator precedence', () => {
    expect(run('1+2*3')).toBe(7)
    expect(run('(1+2)*3')).toBe(9)
    expect(run('10%4')).toBe(2)
    expect(run('ROUND(10 * 1.19, 2)')).toBe(11.9)
  })

  it('evaluates the built-in functions', () => {
    expect(run(`SUM({${column}})`, { [column]: [1, 2, 3, 'x'] })).toBe(6)
    expect(run(`AVERAGE({${column}})`, { [column]: [2, 4] })).toBe(3)
    expect(run(`MIN({${column}})`, { [column]: [3, 1, 2] })).toBe(1)
    expect(run(`MAX({${column}})`, { [column]: [3, 1, 2] })).toBe(3)
    expect(run(`COUNT({${column}})`, { [column]: [1, 'a', 2] })).toBe(2)
    expect(run(`COUNTA({${column}})`, { [column]: [1, 'a', null, ''] })).toBe(2)
    expect(run(`IF({${column}} > 100, "High", "Low")`, { [column]: 150 })).toBe('High')
    expect(run(`IF({${column}} > 100, "High", "Low")`, { [column]: 10 })).toBe('Low')
    expect(run('AND(1, 0)')).toBe(false)
    expect(run('OR(0, 1)')).toBe(true)
    expect(run('NOT(0)')).toBe(true)
    expect(run('ABS(-4)')).toBe(4)
    expect(run('CONCAT("a", " ", "b")')).toBe('a b')
    expect(run(`{${column}} & " " & {${other}}`, { [column]: 'Ada', [other]: 'Lovelace' })).toBe('Ada Lovelace')
    expect(run('LEFT("Hello", 2)')).toBe('He')
    expect(run('RIGHT("Hello", 2)')).toBe('lo')
    expect(run('LEN("Hello")')).toBe(5)
    expect(run('LOWER("Hello")')).toBe('hello')
    expect(run('UPPER("Hello")')).toBe('HELLO')
    expect(run('TODAY()')).toBe('2026-01-02')
    expect(run('NOW()')).toBe('2026-01-02T03:04:05.000Z')
  })

  it('short-circuits IF so the unused branch is not read', () => {
    const seen: string[] = []
    const result = run(`IF(1, "ok", {${column}})`, {}, {
      get: (ref) => {
        seen.push(ref.columnId)
        return 1
      },
    })
    expect(result).toBe('ok')
    expect(seen).toEqual([])
  })

  it('returns spreadsheet errors for bad math, missing refs, and cycles', () => {
    expect(run('1/0')).toEqual({ error: '#DIV/0' })
    expect(run('AVERAGE("a")')).toEqual({ error: '#DIV/0' })
    expect(run(`{${column}}`, {})).toEqual({ error: '#REF' })
    expect(run(`{${column}}`, { [column]: { error: '#CYCLE' } })).toEqual({ error: '#CYCLE' })
  })

  it('enforces length, depth, step, and time limits', () => {
    expect(() => parseFormula('1'.repeat(2001))).toThrow(/too long/)
    const nested = `${'IF(1,'.repeat(40)}1${')'.repeat(40)}`
    expect(() => parseFormula(nested)).toThrow(/too deep/)
    let ticks = 0
    const limited = run('1+1', {}, {
      now: () => {
        ticks += 60
        return ticks
      },
    })
    expect(limited).toEqual({ error: '#LIM' })
  })

  it('collects stable references and resolves display names', () => {
    const ast = parseFormula(`SUM({${table}}.{${column}})`)
    expect(collectRefs(ast)).toEqual([{ tableId: table, columnId: column }])
    const canonical = canonicalize('SUM(Customers.Total)', {
      'Customers.Total': { tableId: table, columnId: column },
    })
    expect(canonical).toBe(`SUM({${table}}.{${column}})`)
  })

  it('looks up related values through the caller-supplied resolver', () => {
    const expression = `LOOKUP({${table}}.{${column}}, {${other}}, {${table}}.{${column}})`
    const result = run(expression, { [other]: 'abc' }, {
      lookup: (_table, _match, needle) => (needle === 'abc' ? 42 : { error: '#N/A' }),
    })
    expect(result).toBe(42)
  })
})
