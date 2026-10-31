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
