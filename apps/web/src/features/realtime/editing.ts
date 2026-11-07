const cells = new Set<string>()
const notes = new Set<string>()
const stashedCells = new Map<string, unknown>()
const stashedNotes = new Map<string, string>()

export function cellKey(rowId: string, columnId: string) {
  return `${rowId}:${columnId}`
}

export function splitCellKey(key: string) {
  const index = key.indexOf(':')
  if (index <= 0) return null
  return { rowId: key.slice(0, index), columnId: key.slice(index + 1) }
}

export function setCellEditing(rowId: string, columnId: string) {
  cells.clear()
  cells.add(cellKey(rowId, columnId))
}

export function clearCellEditing() {
  cells.clear()
}

export function isCellEditing(rowId: string, columnId: string) {
  return cells.has(cellKey(rowId, columnId))
}

export function setNotesEditing(rowId: string, editing: boolean) {
  if (editing) notes.add(rowId)
  else notes.delete(rowId)
}

export function isNotesEditing(rowId: string) {
  return notes.has(rowId)
}

export function stashRemoteCell(rowId: string, columnId: string, value: unknown) {
  stashedCells.set(cellKey(rowId, columnId), value)
}

export function dropStashedCell(rowId: string, columnId: string) {
  stashedCells.delete(cellKey(rowId, columnId))
}

export function takeStashedCell(rowId: string, columnId: string) {
  const key = cellKey(rowId, columnId)
  if (!stashedCells.has(key)) return undefined
  const value = stashedCells.get(key)
  stashedCells.delete(key)
  return value
}

export function stashRemoteNotes(rowId: string, notesText: string) {
  stashedNotes.set(rowId, notesText)
}

export function takeStashedNotes(rowId: string) {
  if (!stashedNotes.has(rowId)) return undefined
  const value = stashedNotes.get(rowId)
  stashedNotes.delete(rowId)
  return value
}
