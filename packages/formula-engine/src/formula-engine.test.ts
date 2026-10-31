import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { collectRefs, parseFormula, runFormula, canonicalize, displayFormula, resolveBrackets, wholeColumnInMath } from './index.js'
import type { BracketCatalog, EvalContext, FormulaValue, RefNode } from './index.js'

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

  it('keeps a quoted column name as text and still binds the name outside quotes', () => {
    const names = { Test: { tableId: table, columnId: column } }
    const ref = `{${table}}.{${column}}`
    expect(canonicalize(`IF(${ref} = "Test", TRUE, FALSE)`, names)).toBe(`IF(${ref} = "Test", TRUE, FALSE)`)
    expect(canonicalize('Test = "Test"', names)).toBe(`${ref} = "Test"`)
    expect(canonicalize('Test = "Say ""Test"""', names)).toBe(`${ref} = "Say ""Test"""`)
  })

  it('returns a number, text, or boolean from a condition', () => {
    expect(run('IF(1, 2, 3)')).toBe(2)
    expect(run('IF(0, "High", "Low")')).toBe('Low')
    expect(run('IF(1, TRUE, FALSE)')).toBe(true)
    expect(run('IFNOT(TRUE, "Open", "Done")')).toBe('Done')
    expect(run('IFNOT(FALSE, "Open", "Done")')).toBe('Open')
    expect(run('IFS(0, "A", 1, "B")')).toBe('B')
    expect(run('IFS(0, "A", 0, "B")')).toEqual({ error: '#N/A' })
  })

  it('walks a list with FOR and IT', () => {
    expect(run(`FOR({${column}}, IF(IT > 100, "High", "Low"))`, { [column]: [150, 10] })).toEqual(['High', 'Low'])
    expect(run(`SUM(FOR({${column}}, IF(IT > 0, IT, 0)))`, { [column]: [2, -1, 3] })).toBe(5)
    expect(run('IT')).toEqual({ error: '#VALUE' })
    expect(run('CONTAINS("Hello", "ell")')).toBe(true)
    expect(run(`CONTAINS({${column}}, "Lead")`, { [column]: ['Customer', 'Lead'] })).toBe(true)
    expect(run('YEAR("2026-01-02")')).toBe(2026)
    expect(run('MONTH("2026-01-02")')).toBe(1)
    expect(run('DAY("2026-01-02T03:04:05.000Z")')).toBe(2)
    expect(run(`COUNTIF({${column}}, "Open")`, { [column]: ['Open', 'Done', 'Open'] })).toBe(2)
    expect(run(`SUMIF({${column}}, "Open", {${other}})`, { [column]: ['Open', 'Done'], [other]: [4, 9] })).toBe(4)
    expect(run('ISBLANK("")')).toBe(true)
  })

  it('resolves a cell name that includes a row id', () => {
    const row = '44444444-4444-4444-8444-444444444444'
    const canonical = canonicalize(`People.Name@${row}`, {
      'People.Name': { tableId: table, columnId: column },
      [`People.Name@${row}`]: { tableId: table, columnId: column, rowId: row },
    })
    expect(canonical).toBe(`{${table}}.{${column}}@{${row}}`)
  })

  it('resolves bracket references, including spaces, dots, and a linked field', () => {
    const people = table
    const orders = '55555555-5555-4555-8555-555555555555'
    const localName = '66666666-6666-4666-8666-666666666666'
    const peopleName = '77777777-7777-4777-8777-777777777777'
    const dotted = '88888888-8888-4888-8888-888888888888'
    const relation = '99999999-9999-4999-8999-999999999999'
    const row = '44444444-4444-4444-8444-444444444444'
    const catalog: BracketCatalog = {
      tableId: orders,
      columns: [
        { name: 'Column copy', columnId: column, tableId: people, tableName: 'People' },
        { name: 'Column. copy', columnId: dotted, tableId: people, tableName: 'People' },
        { name: 'Name', columnId: localName, tableId: orders, tableName: 'Orders' },
        { name: 'Name', columnId: peopleName, tableId: people, tableName: 'People' },
        { name: 'Price', columnId: other, tableId: orders, tableName: 'Orders' },
      ],
      relations: [
        {
          name: 'Customer',
          columnId: relation,
          toTableId: people,
          toTableName: 'People',
          fields: [{ name: 'Name', columnId: peopleName }],
        },
      ],
      rows: [{ tableId: people, rowNumber: 15, rowId: row }],
    }
    const cell = `1 + 2 + 7 / 4 / 3.75646 + [People -> Column copy -> #15]`
    const resolved = resolveBrackets(cell, catalog)
    expect(resolved).toBe(`1 + 2 + 7 / 4 / 3.75646 + {${people}}.{${column}}@{${row}}`)
    expect(displayFormula(resolved, catalog)).toBe(cell)
    expect(resolveBrackets('[People -> Column. copy]', catalog)).toBe(`{${people}}.{${dotted}}`)
    expect(resolveBrackets('SUM([People -> Column copy])', catalog)).toBe(`SUM({${people}}.{${column}})`)
    expect(resolveBrackets('[Customer -> Name]', catalog)).toBe(`RELATION({${relation}}, {${people}}.{${peopleName}})`)
    expect(resolveBrackets('[Name]', catalog)).toBe(`{${localName}}`)
    expect(resolveBrackets('CONCAT("[Name]", [Price])', catalog)).toBe(`CONCAT("[Name]", {${other}})`)
    expect(wholeColumnInMath(parseFormula(resolveBrackets('1 + [People -> Column copy]', catalog)))).toEqual({
      tableId: people,
      columnId: column,
    })
    expect(wholeColumnInMath(parseFormula(resolveBrackets('SUM([People -> Column copy]) + [Price]', catalog)))).toBeNull()
    expect(() => resolveBrackets('[People -> Column copy -> #99]', catalog)).toThrow(/Unknown row #99/)
    expect(() =>
      resolveBrackets('[A -> B]', {
        ...catalog,
        columns: [...catalog.columns, { name: 'A -> B', columnId: column, tableId: orders, tableName: 'Orders' }],
      }),
    ).toThrow(/cannot contain/)
  })

  it('looks up related values through the caller-supplied resolver', () => {
    const expression = `LOOKUP({${table}}.{${column}}, {${other}}, {${table}}.{${column}})`
    const result = run(expression, { [other]: 'abc' }, {
      lookup: (_table, _match, needle) => (needle === 'abc' ? 42 : { error: '#N/A' }),
    })
    expect(result).toBe(42)
  })
})
