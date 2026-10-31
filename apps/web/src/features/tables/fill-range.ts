export function fillTargets<T extends { id: string }>(
  rows: T[],
  fromIndex: number,
  toIndex: number,
  canFill: boolean,
): string[] {
  if (!canFill) return []
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return []
  if (fromIndex < 0 || fromIndex >= rows.length) return []
  const end = Math.min(Math.max(toIndex, 0), rows.length - 1)
  const start = Math.min(fromIndex, end)
  const last = Math.max(fromIndex, end)
  const ids: string[] = []
  for (let index = start; index <= last; index += 1) {
    if (index === fromIndex) continue
    const row = rows[index]
    if (row) ids.push(row.id)
  }
  return ids
}
