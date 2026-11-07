import type { AiHighlight } from '@datavalley/shared'

const id = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const projectPath = new RegExp(`^/projects/${id}$`, 'i')
const tablePath = new RegExp(`^/projects/${id}/tables/(${id})$`, 'i')

export function safeAppPath(path: string | null | undefined) {
  if (!path) return null
  if (projectPath.test(path) || tablePath.test(path)) return path
  return null
}

export function tableIdFromAppPath(path: string) {
  return tablePath.exec(path)?.[1] ?? null
}

export function highlightsForDestination(highlights: AiHighlight[], path: string | null, currentTableId?: string) {
  const tableId = path ? tableIdFromAppPath(path) : currentTableId
  if (!tableId) return null
  const mine = highlights.filter((item) => item.tableId === tableId)
  if (mine.length === 0) return null
  return {
    tableId,
    cells: mine.flatMap((item) => item.cells),
    rowIds: mine.flatMap((item) => item.rowIds),
    columnIds: mine.flatMap((item) => item.columnIds),
  }
}
