import { describe, expect, it } from 'vitest'
import { isNotesDialogOutsideTarget } from './notes-dialog-outside.js'

describe('isNotesDialogOutsideTarget', () => {
  it('matches portaled cell popover markers', () => {
    const menu = {
      closest(selector: string) {
        return selector.includes('data-tag-menu') || selector.includes('data-formula-window') ? menu : null
      },
    }
    expect(isNotesDialogOutsideTarget(menu as unknown as EventTarget)).toBe(true)
    expect(isNotesDialogOutsideTarget({ closest: () => null } as unknown as EventTarget)).toBe(false)
    expect(isNotesDialogOutsideTarget(null)).toBe(false)
  })
})
