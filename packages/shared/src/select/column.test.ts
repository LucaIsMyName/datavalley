import { describe, expect, it } from 'vitest'
import { isSelectFamilyType, selectColumnMultiple } from './column.js'

describe('select column helpers', () => {
  it('detects select family types', () => {
    expect(isSelectFamilyType('select')).toBe(true)
    expect(isSelectFamilyType('multi_select')).toBe(true)
    expect(isSelectFamilyType('text')).toBe(false)
  })

  it('resolves multiple flag', () => {
    expect(selectColumnMultiple({ type: 'multi_select' })).toBe(true)
    expect(selectColumnMultiple({ type: 'radio' })).toBe(false)
    expect(selectColumnMultiple({ type: 'select', config: { multiple: true } })).toBe(true)
    expect(selectColumnMultiple({ type: 'select', config: {} })).toBe(false)
  })
})
