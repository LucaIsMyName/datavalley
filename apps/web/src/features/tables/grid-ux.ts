export function composeDateValue(type: string, date: string, time: string) {
  if (!date && !time) return ''
  if (type === 'datetime' && time) return `${date}T${time}`
  return date
}

export function emptyGridKind(rowCount: number, filtered: boolean): 'rows' | 'empty' | 'filtered' {
  if (rowCount > 0) return 'rows'
  return filtered ? 'filtered' : 'empty'
}

export function createdProjectPath(result: { project?: { id?: string } } | undefined) {
  const projectId = result?.project?.id
  return projectId ? `/projects/${projectId}` : null
}

export function selectionKind(rows: number, columns: number): 'none' | 'rows' | 'columns' | 'both' {
  if (rows > 0 && columns > 0) return 'both'
  if (rows > 0) return 'rows'
  if (columns > 0) return 'columns'
  return 'none'
}

export function filterOperatorKey(op: string) {
  return `filterOp_${op}`
}

export function cardinalityKey(value: string) {
  return `cardinality_${value}`
}

export function beginRename(pending: { current: boolean }) {
  if (pending.current) return false
  pending.current = true
  return true
}

export function finishRename(pending: { current: boolean }) {
  pending.current = false
}

export function rowTint(color: string | null | undefined, token: string | undefined) {
  if (!color || !token) return undefined
  return `color-mix(in srgb, ${token} 55%, var(--card))`
}

export function colorLabelKey(color: string) {
  return `color_${color}`
}
