import { describe, expect, it } from 'vitest'
import { gridKeyCommand } from './grid-keyboard'

function key(partial: { key: string; meta?: boolean; ctrl?: boolean; shift?: boolean }) {
  return {
    key: partial.key,
    metaKey: Boolean(partial.meta),
    ctrlKey: Boolean(partial.ctrl),
    shiftKey: Boolean(partial.shift),
  }
}

describe('grid keyboard', () => {
  const ready = { typing: false, inGrid: true }

  it('maps editing keys when the grid is focused and the user is not typing', () => {
    expect(gridKeyCommand(key({ key: 'z', meta: true }), ready)).toBe('undo')
    expect(gridKeyCommand(key({ key: 'z', ctrl: true, shift: true }), ready)).toBe('redo')
    expect(gridKeyCommand(key({ key: 'c', meta: true }), ready)).toBe('copy')
    expect(gridKeyCommand(key({ key: 'v', meta: true }), ready)).toBe('paste')
    expect(gridKeyCommand(key({ key: 'Delete' }), ready)).toBe('clear')
    expect(gridKeyCommand(key({ key: 'Backspace' }), ready)).toBe('clear')
    expect(gridKeyCommand(key({ key: 'Enter' }), ready)).toBe('activate')
    expect(gridKeyCommand(key({ key: 'ArrowDown' }), ready)).toEqual({
      type: 'move',
      key: 'ArrowDown',
    })
  })

  it('ignores typing, keys from outside the grid, and unrelated keys', () => {
    expect(gridKeyCommand(key({ key: 'z', meta: true }), { typing: true, inGrid: true })).toBeNull()
    expect(
      gridKeyCommand(key({ key: 'c', meta: true }), { typing: false, inGrid: false }),
    ).toBeNull()
    expect(gridKeyCommand(key({ key: 'Enter' }), { typing: false, inGrid: false })).toBeNull()
    expect(gridKeyCommand(key({ key: 'ArrowLeft' }), { typing: false, inGrid: false })).toBeNull()
    expect(gridKeyCommand(key({ key: 'a' }), ready)).toBeNull()
  })
})
