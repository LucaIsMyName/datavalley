import { describe, expect, it } from 'vitest'
import { MAX_MEDIA_FILES_PER_CELL, mergeMediaFileIds, normalizeMediaCellValue, parseMediaCellInput } from './media.js'

describe('media cell helpers', () => {
  it('normalizes legacy fileId', () => {
    expect(normalizeMediaCellValue({ fileId: 'a' })).toEqual({ fileIds: ['a'] })
  })

  it('dedupes fileIds', () => {
    expect(normalizeMediaCellValue({ fileIds: ['a', 'a', 'b'] })).toEqual({ fileIds: ['a', 'b'] })
  })

  it('returns null for empty lists', () => {
    expect(normalizeMediaCellValue({ fileIds: [] })).toBeNull()
  })

  it('merges selections without exceeding max', () => {
    const existing = ['a', 'b']
    const added = ['b', 'c', 'd']
    expect(mergeMediaFileIds(existing, added)).toEqual(['a', 'b', 'c', 'd'])
    const many = Array.from({ length: MAX_MEDIA_FILES_PER_CELL }, (_, index) => `f${index}`)
    expect(mergeMediaFileIds(many, ['new']).length).toBe(MAX_MEDIA_FILES_PER_CELL)
  })

  it('enforces max files', () => {
    const ids = Array.from({ length: MAX_MEDIA_FILES_PER_CELL + 1 }, (_, index) => String(index))
    expect(() => parseMediaCellInput({ fileIds: ids })).toThrow('too_many_media_files')
  })
})
