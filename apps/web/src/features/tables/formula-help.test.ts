import { describe, expect, it } from 'vitest'
import { FORMULA_HELP, formatFormulaValue } from './formula-help'

const FUNCTIONS = [
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
]

describe('formula help', () => {
  it('lists every function with an insert snippet and an example', () => {
    expect(FORMULA_HELP.map((item) => item.name)).toEqual(FUNCTIONS)
    for (const item of FORMULA_HELP) {
      expect(item.insert.startsWith(`${item.name}(`)).toBe(true)
      expect(item.example.length).toBeGreaterThan(item.name.length)
      expect(item.example.startsWith('=')).toBe(false)
    }
  })

  it('shows a boolean as TRUE or FALSE and joins a list with a comma', () => {
    expect(formatFormulaValue(true)).toBe('TRUE')
    expect(formatFormulaValue(false)).toBe('FALSE')
    expect(formatFormulaValue(['High', 'Low'])).toBe('High, Low')
    expect(formatFormulaValue({ error: '#N/A' })).toBe('#N/A')
    expect(formatFormulaValue(8)).toBe('8')
  })
})
