export type UndoCommand<T> = {
  undo: T
  redo: T
}

export function createUndoStack<T>(limit = 50) {
  const undo: UndoCommand<T>[] = []
  const redo: UndoCommand<T>[] = []
  return {
    push(command: UndoCommand<T>) {
      undo.push(command)
      if (undo.length > limit) undo.shift()
      redo.length = 0
    },
    popUndo() {
      const command = undo.pop()
      if (!command) return null
      redo.push(command)
      return command
    },
    popRedo() {
      const command = redo.pop()
      if (!command) return null
      undo.push(command)
      return command
    },
    get size() {
      return undo.length
    },
  }
}
