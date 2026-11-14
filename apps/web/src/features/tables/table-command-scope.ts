import type { QueryClient, UseQueryResult } from '@tanstack/react-query'
import type { Column, MediaFile, RowRecord, TableRecord } from '@datavalley/api-client'
import type { FilterNode, FormatRule, TableDisplayState } from '@datavalley/shared'
import type { TFunction } from 'i18next'
import type { i18n as I18nInstance } from 'i18next'
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import type { NavigateFunction } from 'react-router'
import type { FileUploadHandle } from '../../components/file-upload'
import type { ViewportAnchor } from '../../lib/place-in-viewport'
import type { ConfirmState, PopoverState, SavedView } from './table-screen-types'

export type MenuHost = {
  open: (event: React.MouseEvent, items: import('../../components/context-menu').MenuEntry[]) => void
  replace: (items: import('../../components/context-menu').MenuEntry[]) => void
}

export type TableMenuScopeCore = {
  t: TFunction
  i18n: I18nInstance
  navigate: NavigateFunction
  openMenu: MenuHost['open']
  replaceMenu: MenuHost['replace']
  queryClient: QueryClient
  setCsvImportOpen: Dispatch<SetStateAction<boolean>>
  sort: { columnId: string; direction: 'asc' | 'desc' } | null
  setSort: Dispatch<SetStateAction<{ columnId: string; direction: 'asc' | 'desc' } | null>>
  setFilterInput: Dispatch<SetStateAction<Record<string, { op: string; value: string }>>>
  setFilters: Dispatch<SetStateAction<Record<string, { op: string; value: string }>>>
  checked: string[]
  setChecked: Dispatch<SetStateAction<string[]>>
  fill: { columnId: string; from: number; to: number } | null
  setRenamingColumn: Dispatch<SetStateAction<string | null>>
  setPopover: Dispatch<SetStateAction<PopoverState | null>>
  setConfirm: Dispatch<SetStateAction<ConfirmState | null>>
  setRelationTarget: Dispatch<SetStateAction<string>>
  setFormatTarget: Dispatch<SetStateAction<{ columnId: string; rowId?: string } | null>>
  viewName: string
  setViewName: Dispatch<SetStateAction<string>>
  sharedView: boolean
  display: TableDisplayState
  setDisplay: Dispatch<SetStateAction<TableDisplayState>>
  setActiveViewId: Dispatch<SetStateAction<string | null>>
  setDrawerRowId: Dispatch<SetStateAction<string | null>>
  filter: FilterNode | null
  table: TableRecord | undefined
  dataReadOnly: boolean
  cellWritable: (column: Column) => boolean
  setLockPending: Dispatch<SetStateAction<boolean>>
  columns: Column[]
  rules: FormatRule[]
  projectId: string
  rowsRef: MutableRefObject<RowRecord[]>
  scheduleCell: (row: RowRecord, column: Column, value: unknown, delay?: number) => void
  footerConfig: { enabled?: boolean; columns?: Record<string, string> }
  views: UseQueryResult<{ views: SavedView[] }>
  projectTables: UseQueryResult<{ tables: TableRecord[] }>
  flags: { canUndo: boolean; canRedo: boolean }
  tableId: string
  undo: (direction: 'undo' | 'redo') => Promise<void>
  activateCell: (row: RowRecord, column: Column) => void
  openNewColumn: (beforeId: string | undefined, point: ViewportAnchor) => void
  cycleSort: (columnId: string) => void
}

export type TableColumnCommandScope = {
  t: TFunction
  queryClient: QueryClient
  selectedColumns: string[]
  setSelectedColumns: Dispatch<SetStateAction<string[]>>
  selected: { row: number; column: number }
  setRenamingColumn: Dispatch<SetStateAction<string | null>>
  popover: PopoverState | null
  setPopover: Dispatch<SetStateAction<PopoverState | null>>
  setConfirm: Dispatch<SetStateAction<ConfirmState | null>>
  relationTarget: string
  setRelationTarget: Dispatch<SetStateAction<string>>
  relationCardinality: string
  setFormatTarget: Dispatch<SetStateAction<{ columnId: string; rowId?: string } | null>>
  filter: FilterNode | null
  dataReadOnly: boolean
  columns: Column[]
  rows: RowRecord[]
  rules: FormatRule[]
  footerConfig: { enabled?: boolean; columns?: Record<string, string> }
  table: TableRecord | undefined
  tableId: string
  refresh: () => Promise<void>
  fetchRows: () => Promise<RowRecord[]>
  loadEveryRow: () => Promise<RowRecord[]>
}

export type TableRowCommandScope = {
  t: TFunction
  queryClient: QueryClient
  parentRef: RefObject<HTMLDivElement | null>
  mediaUploadRef: RefObject<FileUploadHandle | null>
  setCsvImportOpen: Dispatch<SetStateAction<boolean>>
  setCsvImportBusy: Dispatch<SetStateAction<boolean>>
  setCsvImportErrors: Dispatch<SetStateAction<string[]>>
  setCsvImportDuplicates: Dispatch<
    SetStateAction<
      { columnName: string; value: string; rows: { rowId: string; title: string; href: string }[] }[]
    >
  >
  mediaUploadTarget: MutableRefObject<{ rowId: string; columnId: string } | null>
  checked: string[]
  setChecked: Dispatch<SetStateAction<string[]>>
  selected: { row: number; column: number }
  fill: { columnId: string; from: number; to: number } | null
  setFill: Dispatch<SetStateAction<{ columnId: string; from: number; to: number } | null>>
  setEditing: Dispatch<SetStateAction<string | null>>
  setPopover: Dispatch<SetStateAction<PopoverState | null>>
  setFormatTarget: Dispatch<SetStateAction<{ columnId: string; rowId?: string } | null>>
  setMediaPreview: Dispatch<
    SetStateAction<{ file: MediaFile; rowId: string; columnId: string } | null>
  >
  filter: FilterNode | null
  dataReadOnly: boolean
  cellWritable: (column: Column) => boolean
  visible: Column[]
  rows: RowRecord[]
  rowsRef: MutableRefObject<RowRecord[]>
  applyMediaCell: (
    row: RowRecord,
    column: Column,
    value: { fileIds: string[] } | null,
  ) => Promise<void>
  tableId: string
  refresh: () => Promise<void>
  undo: (direction: 'undo' | 'redo') => Promise<void>
  fetchRows: () => Promise<RowRecord[]>
}