import type { Column } from '@datavalley/api-client'
import { describe, expect, it } from 'vitest'
import { cellDraftUnchanged } from './use-row-cell-edit.js'

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

describe('cellDraftUnchanged', () => {
  it('treats identical primitives as unchanged', () => {
    expect(cellDraftUnchanged(column('text'), 'hello', 'hello')).toBe(true)
    expect(cellDraftUnchanged(column('text'), 'hello', 'world')).toBe(false)
  })

  it('compares media and date values by JSON', () => {
    const media = column('media')
    expect(cellDraftUnchanged(media, { fileIds: ['a'] }, { fileIds: ['a'] })).toBe(true)
    expect(cellDraftUnchanged(media, { fileIds: ['a'] }, { fileIds: ['b'] })).toBe(false)
  })
})
