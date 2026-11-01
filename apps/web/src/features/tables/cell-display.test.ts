import type { Column } from '@datavalley/api-client'
import { describe, expect, it } from 'vitest'
import { cellWritable, fillableColumn } from './cell-display.js'

const column = (type: string): Column =>
  ({
    id: 'c1',
    name: 'Field',
    type,
    width: 100,
    position: 'a',
    hidden: false,
    config: {},
    options: [],
  }) as unknown as Column

describe('cellWritable', () => {
  it('allows text columns and blocks formulas', () => {
    expect(cellWritable(column('text'))).toBe(true)
    expect(cellWritable(column('formula'))).toBe(false)
    expect(cellWritable(column('lookup'))).toBe(false)
  })
})

describe('fillableColumn', () => {
  it('blocks row_id and lookup', () => {
    expect(fillableColumn(column('text'))).toBe(true)
    expect(fillableColumn(column('lookup'))).toBe(false)
    expect(fillableColumn(column('row_id'))).toBe(false)
  })
})
