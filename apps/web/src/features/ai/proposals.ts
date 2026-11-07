import type { AiCellChange, AiCellProposal } from '@datavalley/shared'

export function groupCellUpdates(changes: AiCellChange[]) {
  const grouped = new Map<string, { rowId: string; version: number; cells: Record<string, unknown> }>()
  for (const change of changes) {
    const current = grouped.get(change.rowId) ?? { rowId: change.rowId, version: change.version, cells: {} }
    current.cells[change.columnId] = change.value
    grouped.set(change.rowId, current)
  }
  return [...grouped.values()]
}

export function cellWritePlan(proposal: AiCellProposal): { method: 'PATCH'; path: string; body: unknown } {
  if (proposal.changes.length === 1) {
    const change = proposal.changes[0]
    return {
      method: 'PATCH',
      path: `/rows/${change.rowId}`,
      body: { version: change.version, cells: { [change.columnId]: change.value } },
    }
  }
  return {
    method: 'PATCH',
    path: `/tables/${proposal.tableId}/cells/bulk`,
    body: { updates: groupCellUpdates(proposal.changes) },
  }
}
