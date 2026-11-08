import type { QueryClient } from '@tanstack/react-query'
import type { CatalogItem } from '@datavalley/api-client'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { patchCachedTable } from './cache'
import { mergeColumnOption } from './select-options-utils'
import type { GridRowHandlers } from './grid-row'

export type CreateGridRowHandlersInput = {
  t: GridRowHandlers['t']
  queryClient: QueryClient
  tableId: string
  refresh: () => Promise<unknown>
  openRowMenu: GridRowHandlers['openRowMenu']
  insertRow: GridRowHandlers['insertRow']
  setChecked: GridRowHandlers['setChecked']
  setDrawerRowId: GridRowHandlers['setDrawerRowId']
  openRecord: GridRowHandlers['openRecord']
  focusCell: GridRowHandlers['focusCell']
  activateCell: GridRowHandlers['activateCell']
  scheduleCell: GridRowHandlers['scheduleCell']
  clearInvalid: GridRowHandlers['clearInvalid']
  releaseEdit: GridRowHandlers['releaseEdit']
  setMediaLibrary: GridRowHandlers['setMediaLibrary']
  openMediaPreview: GridRowHandlers['openMediaPreview']
  requestMediaUpload: GridRowHandlers['requestMediaUpload']
  applyMediaCell: GridRowHandlers['applyMediaCell']
  applyDateMode: GridRowHandlers['applyDateMode']
  beginFill: GridRowHandlers['beginFill']
  openCellMenu: GridRowHandlers['openCellMenu']
  cellWritable: GridRowHandlers['cellWritable']
  dataReadOnly: GridRowHandlers['dataReadOnly']
  invalidFor: GridRowHandlers['invalidFor']
  reorderRow: GridRowHandlers['reorderRow']
  setSort: GridRowHandlers['setSort']
  dragItem: MutableRefObject<{ kind: 'column' | 'row'; id: string } | null>
  setDropTarget: Dispatch<SetStateAction<{ kind: 'column' | 'row'; id: string } | null>>
  rowsRef: MutableRefObject<RowRecord[]>
  pressOrigin: MutableRefObject<{ x: number; y: number }>
  pressTimer: MutableRefObject<number>
}

type RowRecord = import('@datavalley/api-client').RowRecord

export function createGridRowHandlers(input: CreateGridRowHandlersInput): GridRowHandlers {
  const {
    t,
    queryClient,
    tableId,
    refresh,
    openRowMenu,
    insertRow,
    setChecked,
    setDrawerRowId,
    openRecord,
    focusCell,
    activateCell,
    scheduleCell,
    clearInvalid,
    releaseEdit,
    setMediaLibrary,
    openMediaPreview,
    requestMediaUpload,
    applyMediaCell,
    applyDateMode,
    beginFill,
    openCellMenu,
    cellWritable,
    dataReadOnly,
    invalidFor,
    reorderRow,
    setSort,
    dragItem,
    setDropTarget,
    rowsRef,
    pressOrigin,
    pressTimer,
  } = input
  return {
    t,
    openRowMenu,
    insertRow,
    setChecked,
    setDrawerRowId,
    openRecord,
    focusCell,
    activateCell,
    scheduleCell,
    clearInvalid,
    releaseEdit,
    setMediaLibrary,
    openMediaPreview,
    requestMediaUpload,
    applyMediaCell,
    applyDateMode,
    beginFill,
    openCellMenu,
    onCreated: (kind, item) => {
      patchCachedTable(queryClient, tableId, (current) => ({
        ...current,
        tags:
          kind === 'tag'
            ? [...(current.tags ?? []).filter((tag) => tag.id !== item.id), item as CatalogItem]
            : current.tags,
        statuses:
          kind === 'status'
            ? [...(current.statuses ?? []).filter((status) => status.id !== item.id), item as CatalogItem]
            : current.statuses,
      }))
    },
    onOptionChange: (columnId, option, deleted) => {
      patchCachedTable(queryClient, tableId, (current) => ({
        ...current,
        columns: current.columns?.map((item) =>
          item.id === columnId ? mergeColumnOption(item, option, deleted) : item,
        ),
      }))
      if (deleted) void refresh()
    },
    cellWritable,
    dataReadOnly,
    invalidFor,
    reorderRow,
    setSort,
    dragItem,
    setDropTarget,
    rowsRef,
    pressOrigin,
    pressTimer,
  }
}
