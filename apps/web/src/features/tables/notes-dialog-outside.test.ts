import { describe, expect, it } from 'vitest'
import { isNotesDialogOutsideTarget } from './notes-dialog-outside.js'

describe('isNotesDialogOutsideTarget', () => {
  it('matches portaled cell popover markers', () => {
    const menu = {
      closest(selector: string) {
        return selector.includes('data-tag-menu') ? menu : null
      },
    }
    expect(isNotesDialogOutsideTarget(menu)).toBe(true)
    expect(isNotesDialogOutsideTarget({ closest: () => null })).toBe(false)
    expect(isNotesDialogOutsideTarget(null)).toBe(false)
  })
})
