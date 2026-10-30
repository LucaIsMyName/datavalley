import { describe, expect, it } from 'vitest'
import { FORMULA_HELP } from './formula-help'

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
  'AND',
  'OR',
  'NOT',
  'CONCAT',
  'LEFT',
  'RIGHT',
  'LEN',
  'LOWER',
  'UPPER',
  'TODAY',
  'NOW',
  'LOOKUP',
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
})
