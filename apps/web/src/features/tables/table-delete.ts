import type { QueryClient } from '@tanstack/react-query'
import type { NavigateFunction } from 'react-router'
import { useFormulaWindow } from '../../stores/formula-window'

export type TableRouteAfterDelete = { kind: 'table'; tableId: string } | { kind: 'project' }

export function tableRouteAfterDelete(tables: { id: string }[], deletedId: string): TableRouteAfterDelete {
  const next = tables.find((table) => table.id !== deletedId)
  if (next) return { kind: 'table', tableId: next.id }
  return { kind: 'project' }
}

export function projectTablePath(projectId: string, route: TableRouteAfterDelete) {
  if (route.kind === 'table') return `/projects/${projectId}/tables/${route.tableId}`
  return `/projects/${projectId}`
}

type ApiLike = { request: (path: string, init?: { method?: string }) => Promise<unknown> }

export async function deleteTableInProject(options: {
  projectId: string
  tableId: string
  tables: { id: string }[]
  activeTableId?: string
  queryClient: QueryClient
  navigate: NavigateFunction
  api: ApiLike
}) {
  const { projectId, tableId, tables, activeTableId, queryClient, navigate, api } = options
  await api.request(`/tables/${tableId}`, { method: 'DELETE' })

  const cell = useFormulaWindow.getState().cell
  if (cell?.tableId === tableId) useFormulaWindow.getState().close()

  queryClient.removeQueries({ queryKey: ['table', tableId] })
  queryClient.removeQueries({ queryKey: ['rows', tableId] })
  queryClient.removeQueries({ queryKey: ['views', tableId] })
  queryClient.removeQueries({ queryKey: ['table-state', tableId] })
  queryClient.removeQueries({ queryKey: ['footer', tableId] })

  await queryClient.invalidateQueries({ queryKey: ['tables', projectId] })

  if (activeTableId === tableId) {
    navigate(projectTablePath(projectId, tableRouteAfterDelete(tables, tableId)))
  }
}
