import type { QueryClient } from '@tanstack/react-query'
import type { RowRecord, TableRecord } from '@datavalley/api-client'

type RowsCache = {
  pages: { rows: RowRecord[]; nextCursor: string | null }[]
  pageParams: unknown[]
}

export function mapCachedRows(queryClient: QueryClient, tableId: string, update: (row: RowRecord) => RowRecord) {
  queryClient.setQueriesData<RowsCache>({ queryKey: ['rows', tableId] }, (data) => {
    if (!data) return data
    return { ...data, pages: data.pages.map((page) => ({ ...page, rows: page.rows.map(update) })) }
  })
}

/** Keep a newer cached row. A slow save must not paint over a row the server has already moved past. */
export function mergeSavedRow(current: RowRecord, saved: RowRecord): RowRecord {
  if (saved.version < current.version) return current
  return { ...current, ...saved, cells: { ...current.cells, ...saved.cells } }
}

export function replaceCachedRows(queryClient: QueryClient, tableId: string, rows: RowRecord[]) {
  if (rows.length === 0) return
  const byId = new Map(rows.map((row) => [row.id, row]))
  mapCachedRows(queryClient, tableId, (item) => {
    const saved = byId.get(item.id)
    return saved ? mergeSavedRow(item, saved) : item
  })
}

export function readCachedRow(queryClient: QueryClient, tableId: string, rowId: string) {
  const entries = queryClient.getQueriesData<RowsCache>({ queryKey: ['rows', tableId] })
  for (const [, data] of entries) {
    const row = data?.pages.flatMap((page) => page.rows).find((item) => item.id === rowId)
    if (row) return row
  }
  return undefined
}

export function patchCachedTable(queryClient: QueryClient, tableId: string, update: (table: TableRecord) => TableRecord) {
  queryClient.setQueryData<{ table: TableRecord }>(['table', tableId], (data) => (data ? { table: update(data.table) } : data))
}

export function invalidateFooter(queryClient: QueryClient, tableId: string) {
  return queryClient.invalidateQueries({ queryKey: ['footer', tableId] })
}

export function invalidateOtherRowQueries(queryClient: QueryClient, tableId: string) {
  return queryClient.invalidateQueries({
    queryKey: ['rows'],
    predicate: (query) => query.queryKey[1] !== tableId,
  })
}

export function invalidateRowTitles(queryClient: QueryClient, tableId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['rows', tableId] }),
    invalidateOtherRowQueries(queryClient, tableId),
  ])
}
