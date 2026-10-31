export type DropEdge = 'before' | 'after'

export function tabDropEdge(ids: string[], fromId: string, toId: string): DropEdge | null {
  const from = ids.indexOf(fromId)
  const to = ids.indexOf(toId)
  if (from < 0 || to < 0 || from === to) return null
  return from < to ? 'after' : 'before'
}

export function beforeDropEdge(ids: string[], fromId: string, toId: string): 'before' | null {
  const from = ids.indexOf(fromId)
  const to = ids.indexOf(toId)
  if (from < 0 || to < 0 || from === to || from + 1 === to) return null
  return 'before'
}
