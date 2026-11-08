import { historyLabel } from './history.js'

const skippedTypes = new Set(['relation', 'formula', 'media', 'lookup', 'row_id'])

export type TitleColumn = {
  id: string
  type: string
  name: string
  position: string
  options?: { id: string; label: string }[]
}

export function rowDisplayTitle(
  columns: TitleColumn[],
  values: Record<string, unknown>,
  labels: Map<string, string>,
  rowId: string,
  mainColumnId?: string | null,
) {
  const ordered = [...columns].sort((left, right) => (left.position < right.position ? -1 : left.position > right.position ? 1 : 0))
  const readable = (column: TitleColumn | undefined) => {
    if (!column || skippedTypes.has(column.type)) return ''
    return historyLabel(column, values[column.id], labels).trim()
  }
  if (mainColumnId) {
    const main = readable(ordered.find((column) => column.id === mainColumnId))
    if (main) return main
  }
  const named = ordered.find(
    (column) =>
      (column.type === 'text' || column.type === 'mail' || column.type === 'url') &&
      column.name.trim().toLowerCase() === 'name',
  )
  const preferred = readable(named)
  if (preferred) return preferred
  for (const column of ordered) {
    const value = readable(column)
    if (value) return value
  }
  return rowId
}
