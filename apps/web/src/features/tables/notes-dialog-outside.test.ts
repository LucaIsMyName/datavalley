import { describe, expect, it } from 'vitest'
import { isNotesBlockMenuTarget, isNotesDialogOutsideTarget } from './notes-dialog-outside.js'

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

  it('keeps the notes edit session while focus is in the block menu', () => {
    const menu = {
      closest(selector: string) {
        return selector.includes('data-notes-block-menu') || selector.includes('data-radix-popper-content-wrapper') ? menu : null
      },
    }
    expect(isNotesBlockMenuTarget(menu as unknown as EventTarget)).toBe(true)
    expect(isNotesBlockMenuTarget({ closest: () => null } as unknown as EventTarget)).toBe(false)
    expect(isNotesBlockMenuTarget(null)).toBe(false)
  })
})
