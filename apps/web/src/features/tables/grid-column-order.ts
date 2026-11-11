export function orderMainColumnFirst<T extends { id: string; hidden?: boolean }>(
  columns: T[],
  mainColumnId: string | null | undefined,
): T[] {
  if (!mainColumnId) return columns
  const index = columns.findIndex((column) => column.id === mainColumnId)
  if (index <= 0) return columns
  const main = columns[index]
  if (!main || main.hidden) return columns
  return [main, ...columns.slice(0, index), ...columns.slice(index + 1)]
}

export function pinnedMainColumnId<T extends { id: string; hidden?: boolean }>(
  columns: T[],
  mainColumnId: string | null | undefined,
) {
  if (!mainColumnId) return null
  const main = columns.find((column) => column.id === mainColumnId)
  if (!main || main.hidden) return null
  return main.id
}
