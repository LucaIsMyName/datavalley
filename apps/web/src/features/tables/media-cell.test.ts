import { describe, expect, it } from 'vitest'
import { mergeMediaIntoCell } from './media-cell'

describe('mergeMediaIntoCell', () => {
  it('appends new file ids to existing cell value', () => {
    expect(mergeMediaIntoCell({ fileIds: ['a'] }, ['b'])).toEqual({ fileIds: ['a', 'b'] })
  })

  it('starts from empty cell', () => {
    expect(mergeMediaIntoCell(null, ['x'])).toEqual({ fileIds: ['x'] })
  })
})
