import { describe, expect, it } from 'vitest'
import { createUndoStack } from './undo.js'

describe('undo stack', () => {
  it('keeps the newest commands up to the limit and restores both directions', () => {
    const stack = createUndoStack<number>(2)
    stack.push({ undo: 1, redo: 1 })
    stack.push({ undo: 2, redo: 2 })
    stack.push({ undo: 3, redo: 3 })
    expect(stack.size).toBe(2)
    const saved = stack.snapshot()
    const restored = createUndoStack<number>(2)
    restored.load(saved.undo, saved.redo)
    expect(restored.popUndo()?.undo).toBe(3)
    expect(restored.popRedo()?.redo).toBe(3)
  })
})
