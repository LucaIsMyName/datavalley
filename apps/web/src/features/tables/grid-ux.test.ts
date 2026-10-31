import { describe, expect, it } from 'vitest'
import {
  beginRename,
  cardinalityKey,
  colorLabelKey,
  composeDateValue,
  createdProjectPath,
  emptyGridKind,
  filterOperatorKey,
  finishRename,
  rowTint,
  selectionKind,
} from './grid-ux.js'

describe('composeDateValue', () => {
  it('joins a datetime only after both parts exist', () => {
    expect(composeDateValue('datetime', '2026-10-31', '')).toBe('2026-10-31')
    expect(composeDateValue('datetime', '2026-10-31', '14:30')).toBe('2026-10-31T14:30')
    expect(composeDateValue('date', '2026-10-31', '14:30')).toBe('2026-10-31')
    expect(composeDateValue('datetime', '', '')).toBe('')
  })
})

describe('emptyGridKind', () => {
  it('tells empty tables from filtered tables', () => {
    expect(emptyGridKind(3, true)).toBe('rows')
    expect(emptyGridKind(0, false)).toBe('empty')
    expect(emptyGridKind(0, true)).toBe('filtered')
  })
})

describe('createdProjectPath', () => {
  it('opens the new project when create returns an id', () => {
    expect(createdProjectPath({ project: { id: 'abc' } })).toBe('/projects/abc')
    expect(createdProjectPath(undefined)).toBeNull()
  })
})

describe('selectionKind', () => {
  it('keeps row and column counts separate', () => {
    expect(selectionKind(0, 0)).toBe('none')
    expect(selectionKind(2, 0)).toBe('rows')
    expect(selectionKind(0, 1)).toBe('columns')
    expect(selectionKind(2, 1)).toBe('both')
  })
})

describe('i18n keys and rename lock', () => {
  it('maps operators, cardinality, and colors', () => {
    expect(filterOperatorKey('not_empty')).toBe('filterOp_not_empty')
    expect(cardinalityKey('many_to_one')).toBe('cardinality_many_to_one')
    expect(colorLabelKey('amber')).toBe('color_amber')
  })

  it('allows another rename after the first succeeds', () => {
    const pending = { current: false }
    expect(beginRename(pending)).toBe(true)
    expect(beginRename(pending)).toBe(false)
    finishRename(pending)
    expect(beginRename(pending)).toBe(true)
  })
})

describe('rowTint', () => {
  it('mixes the swatch into the card so text stays readable', () => {
    expect(rowTint(null, 'var(--swatch-green-bg)')).toBeUndefined()
    expect(rowTint('green', 'var(--swatch-green-bg)')).toBe(
      'color-mix(in srgb, var(--swatch-green-bg) 55%, var(--card))',
    )
  })
})
