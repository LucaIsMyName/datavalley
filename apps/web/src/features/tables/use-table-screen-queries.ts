import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { Column, RowRecord, TableRecord } from '@datavalley/api-client'
import type { FilterNode, TableDisplayState } from '@datavalley/shared'
import { useMemo } from 'react'
import { api } from '../../lib/api'
import { isTableReadOnly } from './table-read-only'
import { ROWS_STALE_MS, type SavedView } from './table-screen-types'

type SortState = { columnId: string; direction: 'asc' | 'desc' } | null

export function useTableScreenQueries({
  tableId,
  search,
  sort,
  filterKey,
  filter,
  display,
  editing,
}: {
  tableId: string
  search: string
  sort: SortState
  filterKey: string
  filter: FilterNode | null
  display: TableDisplayState
  editing: string | null
}) {
  const tableQuery = useQuery({
    queryKey: ['table', tableId],
    queryFn: () => api.request<{ table: TableRecord }>(`/tables/${tableId}`),
  })
  const table = tableQuery.data?.table
  const dataReadOnly = isTableReadOnly(table)
  const columns = table?.columns ?? []
  const projectId = table?.projectId ?? ''
  const footerConfig = (table?.footerConfig ?? {}) as {
    enabled?: boolean
    columns?: Record<string, string>
  }

  const rowsQuery = useInfiniteQuery({
    queryKey: ['rows', tableId, search, sort, filterKey],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '50' })
      if (pageParam) params.set('cursor', pageParam)
      if (search) params.set('q', search)
      if (sort) {
        params.set('sort', sort.columnId)
        params.set('direction', sort.direction)
      }
      if (filter) params.set('filter', JSON.stringify(filter))
      return api.request<{ rows: RowRecord[]; nextCursor: string | null }>(
        `/tables/${tableId}/rows?${params}`,
      )
    },
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: (previous) => previous,
    staleTime: ROWS_STALE_MS,
    refetchOnWindowFocus: false,
  })

  const membersQuery = useQuery({
    queryKey: ['members', projectId],
    enabled: Boolean(projectId),
    queryFn: () =>
      api.request<{ members: { userId: string; username: string }[] }>(
        `/projects/${projectId}/members`,
      ),
  })

  const footerColumnIds = Object.entries(footerConfig.columns ?? {})
    .filter(([, calc]) => Boolean(calc))
    .map(([id]) => id)

  const footerQuery = useQuery({
    queryKey: ['footer', tableId, filterKey, footerColumnIds.join(',')],
    enabled: Boolean(footerConfig.enabled) && footerColumnIds.length > 0,
    queryFn: () => {
      const params = new URLSearchParams()
      if (filter) params.set('filter', JSON.stringify(filter))
      params.set('columns', footerColumnIds.join(','))
      return api.request<{
        footer: Record<
          string,
          {
            count: number
            filled: number
            empty: number
            unique: number
            sum: number | null
            avg: number | null
            median: number | null
            min: unknown
            max: unknown
          }
        >
      }>(`/tables/${tableId}/footer?${params}`)
    },
  })

  const summaryValueIds = display.mode === 'chart' ? display.chart.valueIds : []
  const summaryHasFormula = summaryValueIds.some((id) =>
    columns.some((column: Column) => column.id === id && column.type === 'formula'),
  )
  const summaryDimensionId =
    display.mode === 'chart' &&
    !display.chart.perRow &&
    display.chart.dimensionIds.length === 1 &&
    !display.chart.ownerUserId &&
    !summaryHasFormula
      ? display.chart.dimensionIds[0]
      : display.mode === 'kanban'
        ? display.kanban.statusColumnId
        : null
  const summaryUsesServer = Boolean(summaryDimensionId)

  const summaryQuery = useQuery({
    queryKey: ['summary', tableId, filterKey, summaryDimensionId, summaryValueIds.join(',')],
    enabled: summaryUsesServer,
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('dimension', summaryDimensionId ?? '')
      if (summaryValueIds.length > 0) params.set('values', summaryValueIds.join(','))
      if (filter) params.set('filter', JSON.stringify(filter))
      return api.request<{ groups: { key: string; count: number; sums: Record<string, number> }[] }>(
        `/tables/${tableId}/summary?${params}`,
      )
    },
  })

  const viewsQuery = useQuery({
    queryKey: ['views', tableId],
    queryFn: () => api.request<{ views: SavedView[] }>(`/tables/${tableId}/views`),
  })

  const tableStateQuery = useQuery({
    queryKey: ['table-state', tableId],
    queryFn: () =>
      api.request<{
        sort: { columnId: string; direction: 'asc' | 'desc' } | null
        filter: FilterNode | null
        display: unknown
      }>(`/tables/${tableId}/state`),
  })

  const projectTablesQuery = useQuery({
    queryKey: ['tables', projectId],
    enabled: Boolean(projectId),
    queryFn: () => api.request<{ tables: TableRecord[] }>(`/projects/${projectId}/tables`),
  })

  const relationIcons = useMemo(() => {
    const tables = projectTablesQuery.data?.tables ?? []
    const icons: Record<string, string> = {}
    for (const column of columns) {
      if (column.type !== 'relation') continue
      const icon = tables.find((item) => item.id === String(column.config.toTableId ?? ''))?.icon
      if (icon) icons[column.id] = icon
    }
    return icons
  }, [columns, projectTablesQuery.data?.tables])

  const editingColumn = columns.find((column) => editing?.endsWith(`:${column.id}`))
  const targetTableId =
    editingColumn?.type === 'relation' ? String(editingColumn.config.toTableId ?? '') : ''

  const targetRowsQuery = useQuery({
    queryKey: ['rows', targetTableId, 'link'],
    enabled: Boolean(targetTableId),
    queryFn: () => api.request<{ rows: RowRecord[] }>(`/tables/${targetTableId}/rows?limit=50`),
  })

  return {
    tableQuery,
    table,
    dataReadOnly,
    rowsQuery,
    membersQuery,
    footerQuery,
    summaryQuery,
    viewsQuery,
    tableStateQuery,
    projectTablesQuery,
    targetRowsQuery,
    relationIcons,
    summaryUsesServer,
    summaryDimensionId,
    footerConfig,
  }
}