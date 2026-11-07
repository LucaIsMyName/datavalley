import type { QueryClient } from '@tanstack/react-query'
import type { Project } from '@datavalley/api-client'
import type { RealtimeEvent, RealtimeRow } from '@datavalley/shared'
import { invalidateFooter, invalidateOtherRowQueries, mapCachedRows } from '../tables/cache.js'
import {
  isCellEditing,
  isNotesEditing,
  stashRemoteCell,
  stashRemoteNotes,
  takeStashedCell,
  takeStashedNotes,
} from './editing.js'

const ROWS_INVALIDATE_MS = 200
const rowsInvalidateTimers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleRowsInvalidation(queryClient: QueryClient, tableId: string) {
  const existing = rowsInvalidateTimers.get(tableId)
  if (existing) clearTimeout(existing)
  rowsInvalidateTimers.set(
    tableId,
    setTimeout(() => {
      rowsInvalidateTimers.delete(tableId)
      void queryClient.invalidateQueries({ queryKey: ['table', tableId] })
      void queryClient.invalidateQueries({ queryKey: ['rows', tableId] })
      void invalidateFooter(queryClient, tableId)
      void invalidateOtherRowQueries(queryClient, tableId)
    }, ROWS_INVALIDATE_MS),
  )
}

export function applyRemoteRow(queryClient: QueryClient, tableId: string, row: RealtimeRow) {
  let found = false
  mapCachedRows(queryClient, tableId, (item) => {
    if (item.id !== row.id) return item
    found = true
    const cells = { ...item.cells }
    for (const [columnId, value] of Object.entries(row.cells)) {
      if (isCellEditing(row.id, columnId)) {
        stashRemoteCell(row.id, columnId, value)
        continue
      }
      cells[columnId] = value
    }
    let notes = row.notes
    if (isNotesEditing(row.id)) {
      stashRemoteNotes(row.id, row.notes)
      notes = item.notes
    }
    return {
      ...item,
      position: row.position,
      version: Math.max(item.version, row.version),
      color: row.color,
      notes,
      rowNumber: row.rowNumber,
      cells,
      backgrounds: { ...item.backgrounds, ...row.backgrounds },
      formats: { ...item.formats, ...row.formats },
    }
  })
  return found
}

export function applyStashedCell(queryClient: QueryClient, tableId: string, rowId: string, columnId: string) {
  const value = takeStashedCell(rowId, columnId)
  if (value === undefined) return false
  mapCachedRows(queryClient, tableId, (item) =>
    item.id === rowId ? { ...item, cells: { ...item.cells, [columnId]: value } } : item,
  )
  return true
}

export function applyStashedNotes(queryClient: QueryClient, tableId: string, rowId: string) {
  const notes = takeStashedNotes(rowId)
  if (notes === undefined) return
  mapCachedRows(queryClient, tableId, (item) => (item.id === rowId ? { ...item, notes } : item))
}

export function applyRealtimeEvent(queryClient: QueryClient, event: RealtimeEvent, userId: string) {
  if (event.actorId === userId && (event.type === 'row.updated' || event.type === 'project.updated')) return
  if (event.type === 'project.updated') {
    queryClient.setQueryData<{ project: Project }>(['project', event.project.id], (current) => {
      if (!current) return current
      return {
        project: {
          ...current.project,
          name: event.project.name,
          description: event.project.description,
          icon: event.project.icon,
        },
      }
    })
    return
  }
  if (event.type === 'tables.changed') {
    void queryClient.invalidateQueries({ queryKey: ['tables', event.projectId] })
    if (event.tableId) void queryClient.invalidateQueries({ queryKey: ['table', event.tableId] })
    return
  }
  if (event.type === 'row.updated') {
    applyRemoteRow(queryClient, event.tableId, event.row)
    return
  }
  if (event.type === 'rows.changed' || event.type === 'columns.changed') {
    scheduleRowsInvalidation(queryClient, event.tableId)
  }
}
