import { useQueryClient } from '@tanstack/react-query'
import { ApiClientError, type Column, type RowRecord } from '@datavalley/api-client'
import { formatDateCellValue, isDateColumnType } from '@datavalley/shared'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { sync } from '../../lib/sync'
import { invalidateFooter, mapCachedRows, readCachedRow } from './cache'
import { cellFormatError } from './cell-format'
import { editFailureMessage } from './edit-error'
import { pushCommand } from './history'
import { toast } from 'sonner'

function showEditError(message: string) {
  toast.error(message, { id: 'table-edit-error' })
}
import type { TableReadOnlyReason } from './table-read-only'

export type InvalidCellState = Record<string, { text: string; message: string }>

export function cellDraftUnchanged(column: Column, draft: unknown, previous: unknown) {
  if (draft === previous) return true
  if (column.type === 'media' || isDateColumnType(column.type)) {
    return JSON.stringify(draft ?? null) === JSON.stringify(previous ?? null)
  }
  return false
}

function cellDraftLabel(column: Column, value: unknown, language: string) {
  if (isDateColumnType(column.type)) {
    return formatDateCellValue(value, column, language)
  }
  return value == null ? '' : String(value)
}

export function useRowCellEdit({
  tableId,
  readOnly,
  readOnlyReason,
  getRow,
  onRefreshRows,
}: {
  tableId: string
  readOnly: boolean
  readOnlyReason: TableReadOnlyReason | null
  getRow: (rowId: string) => RowRecord | undefined
  onRefreshRows?: () => void
}) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const cellBaseline = useRef(new Map<string, unknown>())
  const serverReject = useRef(new Map<string, string>())
  const [invalidCells, setInvalidCells] = useState<InvalidCellState>({})

  const clearInvalid = useCallback((key: string) => {
    setInvalidCells((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }, [])

  const warnReadOnlyEdit = useCallback(() => {
    showEditError(readOnlyReason === 'locked' ? t('lockedTableBanner') : t('error'))
  }, [readOnlyReason, t])

  const invalidFor = useCallback(
    (rowId: string, columnId: string) => invalidCells[`cell:${rowId}:${columnId}`],
    [invalidCells],
  )

  const scheduleCell = useCallback(
    (row: RowRecord, column: Column, nextValue: unknown, delay = 300) => {
      if (readOnly) {
        warnReadOnlyEdit()
        return
      }
      const columnId = column.id
      const key = `cell:${row.id}:${columnId}`
      const next = nextValue === '' ? null : nextValue
      const formatKey = cellFormatError(column, next)
      if (formatKey) {
        sync.discard(key)
        setInvalidCells((current) => ({
          ...current,
          [key]: { text: cellDraftLabel(column, next, i18n.language), message: t(formatKey) },
        }))
        return
      }
      clearInvalid(key)
      if (!cellBaseline.current.has(key)) cellBaseline.current.set(key, row.cells[columnId] ?? null)
      const previous = cellBaseline.current.get(key) ?? null
      const paint = delay === 0
      sync.edit(key, {
        draft: next,
        delay,
        apply: (draft) => {
          if (!paint) return
          mapCachedRows(queryClient, tableId, (item) =>
            item.id === row.id ? { ...item, cells: { ...item.cells, [columnId]: draft } } : item,
          )
        },
        commit: async (draft) => {
          if (cellDraftUnchanged(column, draft, previous))
            return {
              row: {
                ...(readCachedRow(queryClient, tableId, row.id) ?? row),
                cells: { ...row.cells, [columnId]: draft },
              },
            }
          const current = readCachedRow(queryClient, tableId, row.id) ?? row
          try {
            return await api.request<{ row: RowRecord }>(`/rows/${row.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ version: current.version, cells: { [columnId]: draft } }),
            })
          } catch (error) {
            if (error instanceof ApiClientError && error.status === 400)
              serverReject.current.set(key, error.message)
            throw error
          }
        },
        accept: (result) => {
          mapCachedRows(queryClient, tableId, (item) =>
            item.id === row.id
              ? { ...item, ...result.row, cells: { ...item.cells, ...result.row.cells } }
              : item,
          )
          cellBaseline.current.delete(key)
          clearInvalid(key)
          const saved = result.row.cells[columnId] ?? null
          if (saved !== previous) {
            pushCommand(tableId, {
              kind: 'patch',
              undo: [{ rowId: row.id, version: result.row.version, cells: { [columnId]: previous } }],
              redo: [{ rowId: row.id, version: result.row.version, cells: { [columnId]: saved } }],
            })
            void queryClient.invalidateQueries({ queryKey: ['rows', tableId] })
            void invalidateFooter(queryClient, tableId)
            onRefreshRows?.()
          }
        },
        rollback: () => {
          const message = serverReject.current.get(key)
          serverReject.current.delete(key)
          cellBaseline.current.delete(key)
          if (message) {
            setInvalidCells((current) => ({
              ...current,
              [key]: { text: cellDraftLabel(column, next, i18n.language), message },
            }))
            return
          }
          mapCachedRows(queryClient, tableId, (item) =>
            item.id === row.id ? { ...item, cells: { ...item.cells, [columnId]: previous } } : item,
          )
          showEditError(t('error'))
        },
      })
    },
    [clearInvalid, i18n.language, onRefreshRows, queryClient, readOnly, t, tableId, warnReadOnlyEdit],
  )

  const commitMediaCell = useCallback(
    async (rowId: string, column: Column, value: { fileIds: string[] } | null) => {
      if (readOnly) {
        warnReadOnlyEdit()
        throw new Error('read_only')
      }
      const columnId = column.id
      const key = `cell:${rowId}:${columnId}`
      sync.discard(key)
      cellBaseline.current.delete(key)
      clearInvalid(key)

      const row = readCachedRow(queryClient, tableId, rowId) ?? getRow(rowId)
      if (!row) throw new Error('Row not found')

      const formatKey = cellFormatError(column, value)
      if (formatKey) {
        setInvalidCells((current) => ({
          ...current,
          [key]: { text: value == null ? '' : JSON.stringify(value), message: t(formatKey) },
        }))
        throw new Error(t(formatKey))
      }

      const previous = row.cells[columnId] ?? null
      const result = await api.request<{ row: RowRecord }>(`/rows/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ version: row.version, cells: { [columnId]: value } }),
      })

      mapCachedRows(queryClient, tableId, (item) =>
        item.id === row.id
          ? { ...item, ...result.row, cells: { ...item.cells, ...result.row.cells } }
          : item,
      )

      const saved = result.row.cells[columnId] ?? null
      if (JSON.stringify(saved ?? null) !== JSON.stringify(previous ?? null)) {
        pushCommand(tableId, {
          kind: 'patch',
          undo: [{ rowId: row.id, version: result.row.version, cells: { [columnId]: previous } }],
          redo: [{ rowId: row.id, version: result.row.version, cells: { [columnId]: saved } }],
        })
        void invalidateFooter(queryClient, tableId)
        onRefreshRows?.()
      }
      void queryClient.invalidateQueries({ queryKey: ['media', 'catalog'] })
      return result.row
    },
    [clearInvalid, getRow, onRefreshRows, queryClient, readOnly, t, tableId, warnReadOnlyEdit],
  )

  const applyMediaCell = useCallback(
    async (row: RowRecord, column: Column, value: { fileIds: string[] } | null) => {
      try {
        await commitMediaCell(row.id, column, value)
      } catch (error) {
        const message = editFailureMessage(error, t('error'), { cell: true })
        if (message) showEditError(message)
        throw error
      }
    },
    [commitMediaCell, t],
  )

  return {
    scheduleCell,
    applyMediaCell,
    invalidCells,
    invalidFor,
    clearInvalid,
  }
}
