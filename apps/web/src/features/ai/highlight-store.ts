import { create } from 'zustand'
import type { AiHighlightTarget } from '@datavalley/shared'

type AiMarks = {
  tableId: string | null
  cells: AiHighlightTarget[]
  rowIds: string[]
  columnIds: string[]
  setMarks: (marks: { tableId: string; cells: AiHighlightTarget[]; rowIds: string[]; columnIds: string[] }) => void
  clear: () => void
}

const empty = { tableId: null, cells: [], rowIds: [], columnIds: [] }

export const useAiHighlight = create<AiMarks>((set) => ({
  ...empty,
  setMarks: (marks) => set(marks),
  clear: () => set(empty),
}))

export function aiColumnKey(
  state: { tableId: string | null; cells: AiHighlightTarget[]; columnIds: string[] },
  tableId: string,
  rowId: string,
) {
  if (state.tableId !== tableId) return ''
  const ids = new Set(state.columnIds)
  for (const cell of state.cells) if (cell.rowId === rowId) ids.add(cell.columnId)
  return [...ids].sort().join(',')
}
