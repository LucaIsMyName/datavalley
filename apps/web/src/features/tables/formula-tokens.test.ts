import { describe, expect, it } from 'vitest'
import { applyCompletion, bracketSpans, changeBreaksBracket, completionAt, deleteAdjacentBracket, type FormulaCatalog } from './formula-tokens'

const catalog: FormulaCatalog = {
  tableId: 'people',
  columns: [
    { tableId: 'people', tableName: 'People', columnId: 'name', columnName: 'Name' },
    { tableId: 'people', tableName: 'People', columnId: 'mail', columnName: 'Mail' },
    { tableId: 'orders', tableName: 'Orders', columnId: 'price', columnName: 'Price' },
  ],
  relations: [{ name: 'Customer', columns: [{ name: 'Price' }, { name: 'Name' }] }],
}

describe('formula tokens', () => {
  it('finds bracket ranges outside strings and leaves an unclosed bracket alone', () => {
    const source = '"[Name]" + [Amount]'
    const from = source.lastIndexOf('[')
    expect(bracketSpans(source)).toEqual([{ from, to: from + '[Amount]'.length, body: 'Amount' }])
    expect(bracketSpans('SUM([Amount')).toEqual([])
    expect(bracketSpans('[A] + [Column copy]').map((span) => span.body)).toEqual(['A', 'Column copy'])
  })

  it('deletes a whole bracket on Backspace or Delete and refuses a partial edit', () => {
    const source = '1 + [Name] + 2'
    const span = bracketSpans(source)[0]
    expect(span).toBeDefined()
    if (!span) return
    expect(deleteAdjacentBracket(source, span.to, 'Backspace')).toEqual({ value: '1 +  + 2', cursor: span.from })
    expect(deleteAdjacentBracket(source, span.from, 'Delete')).toEqual({ value: '1 +  + 2', cursor: span.from })
    expect(deleteAdjacentBracket(source, span.from + 2, 'Backspace')).toBeNull()
    expect(changeBreaksBracket(source, span.from + 1, span.from + 1)).toBe(true)
    expect(changeBreaksBracket(source, span.from, span.to)).toBe(false)
    expect(changeBreaksBracket(source, span.to, span.to)).toBe(false)
  })

  it('lists matching functions and nests the next call inside the parentheses', () => {
    const typed = completionAt('IF', 2, catalog, false, 'formula')
    expect(typed?.kind).toBe('functions')
    if (typed?.kind !== 'functions') return
    expect(typed.items.map((item) => item.label)).toEqual(['IF', 'IFNOT', 'IFS'])
    expect(typed.items[0]?.detail).toBe('IF(Amount > 100, "High", "Low")')

    const sums = completionAt('SU', 2, catalog, false, 'formula')
    if (sums?.kind !== 'functions') throw new Error('expected functions')
    const sum = sums.items.find((item) => item.label === 'SUM')
    if (!sum) throw new Error('expected SUM')
    const first = applyCompletion('SU', sums.from, 2, sum)
    expect(first.value).toBe('SUM()')
    expect(first.value[first.cursor]).toBe(')')
    const nestedSource = `${first.value.slice(0, first.cursor)}AVE${first.value.slice(first.cursor)}`
    const cursor = first.cursor + 3
    const averages = completionAt(nestedSource, cursor, catalog, false, 'formula')
    if (averages?.kind !== 'functions') throw new Error('expected nested functions')
    const average = averages.items.find((item) => item.label === 'AVERAGE')
    if (!average) throw new Error('expected AVERAGE')
    const nested = applyCompletion(nestedSource, averages.from, cursor, average)
    expect(nested.value).toBe('SUM(AVERAGE())')
    expect(nested.value[nested.cursor]).toBe(')')
  })

  it('completes a column, a table, a link, and a row from an open bracket', () => {
    const opened = completionAt('1 + [', 5, catalog, false, 'formula')
    expect(opened?.kind).toBe('brackets')
    if (opened?.kind !== 'brackets') return
    expect(opened.items.map((item) => item.apply)).toEqual([
      '[Name]',
      '[Mail]',
      '[People -> ',
      '[Orders -> ',
      '[Customer -> ',
    ])

    const link = completionAt('[Customer -> P', '[Customer -> P'.length, catalog, false, 'formula')
    expect(link?.kind).toBe('brackets')
    if (link?.kind !== 'brackets') return
    expect(link.items.map((item) => item.apply)).toEqual(['[Customer -> Price]'])

    const column = completionAt('[People -> Ma', '[People -> Ma'.length, catalog, false, 'name')
    expect(column?.kind).toBe('brackets')
    if (column?.kind !== 'brackets') return
    expect(column.items.map((item) => item.apply)).toEqual(['[People -> Mail]', '[People -> Mail -> #'])

    const rows = completionAt('[Orders -> Price -> #1', '[Orders -> Price -> #1'.length, catalog, false, 'formula')
    expect(rows).toEqual({
      from: 0,
      kind: 'rows',
      tableId: 'orders',
      tableName: 'Orders',
      columnName: 'Price',
      prefix: '1',
    })

    const lookup = completionAt('LOOK', 4, catalog, false, 'formula')
    if (lookup?.kind !== 'functions') throw new Error('expected LOOKUP')
    const item = lookup.items.find((entry) => entry.label === 'LOOKUP')
    expect(item?.detail).toBe('LOOKUP([People -> Mail], [Email], [People -> Name])')
    expect(applyCompletion('LOOK', lookup.from, 4, item!).value).toBe('LOOKUP()')
    expect(completionAt('"[Name]"', 6, catalog, false, 'formula')).toBeNull()
  })
})
