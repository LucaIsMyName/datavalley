import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  type Column,
  type RowRecord,
  type MediaFile,
  type TableRecord,
} from '@datavalley/api-client'
import {
  defaultTableDisplay,
  displayRowCap,
  isDateColumnType,
  moveSelection,
  normalizeMediaCellValue,
  normalizeTableDisplay,
  type FilterNode,
  type FormatRule,
  type TableDisplayState,
} from '@datavalley/shared'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  Filter,
  GripVertical,
  Plus,
  Redo2,
  Undo2,
  X,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { useContextMenu } from '../../components/context-menu'
import { QuietInput } from '../../components/quiet-input'
import { Badge } from '../../components/ui/badge'
import { ConfirmDialog } from '../../components/confirm-dialog'
import { FileUpload, type FileUploadHandle } from '../../components/file-upload'
import { Button } from '../../components/ui/button'
import { EmptyState, ErrorState, LoadingBlock } from '../../components/states'
import { api } from '../../lib/api'
import type { ViewportAnchor } from '../../lib/place-in-viewport'
import { sync } from '../../lib/sync'
import { invalidateFooter, patchCachedTable, readCachedRow } from './cache'
import { ConditionalDialog } from './conditional-dialog'
import { CsvImportDialog } from './csv-import-dialog'
import { cellWritable as isColumnWritable, displayCellValue } from './cell-display'
import { ColumnTitle } from './column-title'
import { activateTableCell } from './activate-table-cell'
import { useRowCellEdit } from './use-row-cell-edit'
import { beforeDropEdge } from './drop-place'
import { editFailureMessage } from './edit-error'
import { emptyGridKind, selectionKind } from './grid-ux'
import { useFormulaWindow } from '../../stores/formula-window'
import { ColumnIcon, defaultIcon } from './icons'
import { MediaLibraryDialog } from '../media/media-library-dialog'
import { MediaPreviewDrawer } from '../media/media-preview-drawer'
import { mergeMediaIntoCell } from './media-cell'
import { NotesDrawer } from './notes'
import { MEDIA_UPLOAD_ACCEPT } from '../../lib/media'
import { mergeColumnOption } from './select-options-utils'
import { registerTableMenu } from './table-menu'
import { isTableReadOnly, tableReadOnlyReason } from './table-read-only'
import { ChartView } from './chart-view'
import { TimelineView } from './timeline-view'
import { useRegisterTableToolbar, viewportAnchorFrom } from './table-toolbar'
import { historyFlags, redoTable, undoTable } from './history'
import { activeFilter, filtersFrom, footerValue, moveIdBefore } from './grid-model'
import { anchor, showEditError } from './grid-edit'
import { gridKeyCommand } from './grid-keyboard'
import { useColumnCommands } from './use-column-commands'
import { useRowCommands } from './use-row-commands'
import { useTableMenus } from './use-table-menus'
import { createTableColumns, GUTTER_WIDTH } from './table-columns'
import { GridPopovers } from './grid-popovers'

const TABLE_GRID_DIVIDER = 'border-b border-r border-border'
const TABLE_HEADER_CELL = 'bg-card'
const ADD_COLUMN_WIDTH = 40

type PopoverState = {
  kind:
    | 'filter'
    | 'row-color'
    | 'cell-color'
    | 'relation'
    | 'find'
    | 'view'
    | 'icon'
    | 'new-column'
    | 'select-options'
  beforeId?: string
  columnId?: string
  rowId?: string
} & ViewportAnchor

type ConfirmState = { title: string; body: string; run: () => Promise<void> }

type SavedView = {
  id: string
  name: string
  definition: {
    filter?: FilterNode | null
    sort?: string | { columnId: string; direction?: string } | null
    direction?: string
    formatting?: FormatRule[]
  }
}

function writable(column: Column) {
  return isColumnWritable(column)
}

export function TableScreen({ tableId }: { tableId: string }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { open: openMenu, replace: replaceMenu } = useContextMenu()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const columnParam = searchParams.get('column') ?? ''
  const rowParam = searchParams.get('row') ?? ''
  const parentRef = useRef<HTMLDivElement>(null)
  const mediaUploadRef = useRef<FileUploadHandle>(null)
  const [csvImportOpen, setCsvImportOpen] = useState(false)
  const [csvImportBusy, setCsvImportBusy] = useState(false)
  const mediaUploadTarget = useRef<{ rowId: string; columnId: string } | null>(null)
  const pressTimer = useRef(0)
  const pressOrigin = useRef({ x: 0, y: 0 })
  const dragItem = useRef<{ kind: 'column' | 'row'; id: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ kind: 'column' | 'row'; id: string } | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const appliedLink = useRef('')
  const flashTimer = useRef<number | null>(null)
  const [sort, setSort] = useState<{ columnId: string; direction: 'asc' | 'desc' } | null>(null)
  const [display, setDisplay] = useState<TableDisplayState>(defaultTableDisplay)
  const [filterInput, setFilterInput] = useState<Record<string, { op: string; value: string }>>({})
  const [filters, setFilters] = useState<Record<string, { op: string; value: string }>>({})
  const appliedState = useRef<string | null>(null)
  const [checked, setChecked] = useState<string[]>([])
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [spotlight, setSpotlight] = useState<{ rowId: string; columnId: string } | null>(null)
  const [columnAnchor, setColumnAnchor] = useState<string | null>(null)
  const [selected, setSelected] = useState({ row: 0, column: 0 })
  const [fill, setFill] = useState<{ columnId: string; from: number; to: number } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [newColumnType, setNewColumnType] = useState('text')
  const [stateReady, setStateReady] = useState(false)
  const [renamingColumn, setRenamingColumn] = useState<string | null>(null)
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [relationTarget, setRelationTarget] = useState('')
  const [relationCardinality, setRelationCardinality] = useState('many_to_one')
  const [formatTarget, setFormatTarget] = useState<{ columnId: string; rowId?: string } | null>(
    null,
  )
  const [viewName, setViewName] = useState('')
  const [sharedView, setSharedView] = useState(false)
  const [historyTick, setHistoryTick] = useState(0)
  const [widths, setWidths] = useState<Record<string, number>>({})
  const [drawerRowId, setDrawerRowId] = useState<string | null>(null)
  const [mediaLibrary, setMediaLibrary] = useState<{
    rowId: string
    columnId: string
    existingIds: string[]
  } | null>(null)
  const [mediaPreview, setMediaPreview] = useState<{
    file: MediaFile
    rowId: string
    columnId: string
  } | null>(null)
  const [mediaUploadingKey, setMediaUploadingKey] = useState<string | null>(null)
  const [selectingAll, setSelectingAll] = useState(false)
  const filter = useMemo(() => activeFilter(filters), [filters])
  const filterKey = JSON.stringify(filter)

  const tableQuery = useQuery({
    queryKey: ['table', tableId],
    queryFn: () => api.request<{ table: TableRecord }>(`/tables/${tableId}`),
  })
  const table = tableQuery.data?.table
  const dataReadOnly = isTableReadOnly(table)
  const readOnlyReason = tableReadOnlyReason(table)
  const cellWritable = (column: Column) => !dataReadOnly && writable(column)
  const [lockPending, setLockPending] = useState(false)
  const columns = table?.columns ?? []
  const visible = columns.filter((column) => !column.hidden)
  const rules = (table?.formatRules ?? []) as FormatRule[]
  const projectId = table?.projectId ?? ''
  function openFormula(rowId: string, columnId: string, columnName: string) {
    setEditing(null)
    useFormulaWindow.getState().open({
      tableId,
      projectId,
      tableName: table?.name ?? '',
      rowId,
      columnId,
      columnName,
    })
  }

  function activateCell(row: RowRecord, column: Column) {
    activateTableCell({
      row,
      column,
      readOnly: dataReadOnly,
      onOpenFormula: (targetRow, targetColumn) =>
        openFormula(targetRow.id, targetColumn.id, targetColumn.name),
      onBeginEdit: (columnId) => setEditing(`${row.id}:${columnId}`),
    })
  }

  function focusCell(rowIndex: number, columnIndex: number) {
    setSelected({ row: rowIndex, column: columnIndex })
    parentRef.current?.focus({ preventScroll: true })
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
  })
  const rowPages = rowsQuery.data?.pages
  const rows = useMemo(() => rowPages?.flatMap((page) => page.rows) ?? [], [rowPages])
  useEffect(() => {
    if (display.mode !== 'chart' && display.mode !== 'timeline') return
    if (rowsQuery.isError || rowsQuery.isFetchingNextPage || !rowsQuery.hasNextPage) return
    if (rows.length >= displayRowCap) return
    void rowsQuery.fetchNextPage()
  }, [
    display.mode,
    rows.length,
    rowsQuery.isError,
    rowsQuery.isFetchingNextPage,
    rowsQuery.hasNextPage,
    rowsQuery.fetchNextPage,
  ])
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const { scheduleCell, applyMediaCell, invalidCells, invalidFor, clearInvalid } = useRowCellEdit({
    tableId,
    readOnly: dataReadOnly,
    readOnlyReason,
    getRow: (rowId) =>
      readCachedRow(queryClient, tableId, rowId) ??
      rowsRef.current.find((item) => item.id === rowId),
  })
  const widthKey = `dv-col-widths:${tableId}`
  useEffect(() => {
    try {
      setWidths(JSON.parse(localStorage.getItem(widthKey) ?? '{}') as Record<string, number>)
    } catch {
      setWidths({})
    }
  }, [widthKey])
  const membersQuery = useQuery({
    queryKey: ['members', projectId],
    enabled: Boolean(projectId),
    queryFn: () =>
      api.request<{ members: { userId: string; username: string }[] }>(
        `/projects/${projectId}/members`,
      ),
  })
  const footerConfig = (table?.footerConfig ?? {}) as {
    enabled?: boolean
    columns?: Record<string, string>
  }
  const footerQuery = useQuery({
    queryKey: ['footer', tableId, filterKey],
    enabled: Boolean(footerConfig.enabled),
    queryFn: () =>
      api.request<{
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
      }>(
        `/tables/${tableId}/footer${filter ? `?filter=${encodeURIComponent(JSON.stringify(filter))}` : ''}`,
      ),
  })
  const views = useQuery({
    queryKey: ['views', tableId],
    queryFn: () => api.request<{ views: SavedView[] }>(`/tables/${tableId}/views`),
  })
  const tableState = useQuery({
    queryKey: ['table-state', tableId],
    queryFn: () =>
      api.request<{
        sort: { columnId: string; direction: 'asc' | 'desc' } | null
        filter: FilterNode | null
        display: unknown
      }>(`/tables/${tableId}/state`),
  })
  useEffect(() => {
    if (!tableState.isSuccess || !table || appliedState.current === tableId) return
    appliedState.current = tableId
    const savedSort = tableState.data.sort
    const known =
      savedSort && (table.columns ?? []).some((column) => column.id === savedSort.columnId)
        ? savedSort
        : null
    setSort(
      known && (known.direction === 'desc' || known.direction === 'asc')
        ? { columnId: known.columnId, direction: known.direction === 'desc' ? 'desc' : 'asc' }
        : null,
    )
    const next = filtersFrom(tableState.data.filter)
    setFilters(next)
    setFilterInput(next)
    setDisplay(normalizeTableDisplay(tableState.data.display, table.columns ?? []))
    setStateReady(true)
  }, [table, tableId, tableState.data, tableState.isSuccess])
  useEffect(() => {
    if (!stateReady || appliedState.current !== tableId) return
    const timer = window.setTimeout(() => {
      void api
        .request(`/tables/${tableId}/state`, {
          method: 'PUT',
          body: JSON.stringify({ sort, filter, display }),
        })
        .catch(() => showEditError(t('error')))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [display, filter, sort, stateReady, t, tableId])
  const projectTables = useQuery({
    queryKey: ['tables', projectId],
    enabled: Boolean(projectId),
    queryFn: () => api.request<{ tables: TableRecord[] }>(`/projects/${projectId}/tables`),
  })
  const editingColumn = visible.find((column) => editing?.endsWith(`:${column.id}`))
  const targetTableId =
    editingColumn?.type === 'relation' ? String(editingColumn.config.toTableId ?? '') : ''
  const targetRows = useQuery({
    queryKey: ['rows', targetTableId, 'link'],
    enabled: Boolean(targetTableId),
    queryFn: () => api.request<{ rows: RowRecord[] }>(`/tables/${targetTableId}/rows?limit=50`),
  })

  const titleMenuRef = useRef<(event: ReactMouseEvent) => void>(() => undefined)
  useEffect(() => registerTableMenu((event) => titleMenuRef.current(event)), [])

  useEffect(() => {
    if (!popover) return
    const close = (event: PointerEvent) => {
      if (
        (event.target as HTMLElement | null)?.closest(
          '[data-popover], [role="listbox"], [data-radix-popper-content-wrapper]',
        )
      )
        return
      setPopover(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [popover])

  const allChecked = rows.length > 0 && rows.every((row) => checked.includes(row.id))
  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['table', tableId] })
    await queryClient.invalidateQueries({ queryKey: ['rows', tableId] })
    await invalidateFooter(queryClient, tableId)
    setHistoryTick((value) => value + 1)
  }

  async function fetchRows() {
    const collected: RowRecord[] = []
    let cursor: string | null = null
    do {
      const params = new URLSearchParams({ limit: '100' })
      if (cursor) params.set('cursor', cursor)
      if (search) params.set('q', search)
      if (sort) {
        params.set('sort', sort.columnId)
        params.set('direction', sort.direction)
      }
      if (filter) params.set('filter', JSON.stringify(filter))
      const page = await api.request<{ rows: RowRecord[]; nextCursor: string | null }>(
        `/tables/${tableId}/rows?${params}`,
      )
      collected.push(...page.rows)
      cursor = page.nextCursor
    } while (cursor && collected.length < 5000)
    return collected
  }

  async function loadEveryRow() {
    let latest = rowsQuery.data
    let hasMore = Boolean(rowsQuery.hasNextPage)
    let guard = 0
    while (hasMore && guard < 100) {
      const result = await rowsQuery.fetchNextPage()
      latest = result.data
      hasMore = Boolean(result.hasNextPage)
      guard += 1
    }
    return latest?.pages.flatMap((page) => page.rows) ?? rows
  }

  async function undo(direction: 'undo' | 'redo') {
    try {
      const ran = await (direction === 'undo' ? undoTable(tableId) : redoTable(tableId))
      if (ran) await refresh()
    } catch (caught) {
      const message = editFailureMessage(caught, t('error'))
      if (message) showEditError(message)
    }
  }

  const undoRef = useRef(undo)
  const boundsRef = useRef({ rows: rows.length, columns: visible.length })
  const activateRef = useRef<() => void>(() => {})
  const beginFillRef = useRef<(event: ReactPointerEvent, rowIndex: number, column: Column) => void>(
    () => {},
  )
  const selectedRef = useRef(selected)
  const visibleRef = useRef(visible)
  const editingRef = useRef(editing)
  const copyCellRef = useRef<() => void>(() => {})
  const clearCellRef = useRef<() => void>(() => {})
  const pasteCellRef = useRef<(text: string) => void>(() => {})
  undoRef.current = undo
  boundsRef.current = { rows: rows.length, columns: visible.length }
  selectedRef.current = selected
  visibleRef.current = visible
  editingRef.current = editing
  activateRef.current = () => {
    const column = visible[selected.column]
    const row = rows[selected.row]
    if (!column || !row || editing) return
    activateCell(row, column)
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = Boolean(
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.closest('[role="combobox"], [role="listbox"]')),
      )
      const inGrid = Boolean(parentRef.current?.contains(document.activeElement))
      const command = gridKeyCommand(event, { typing, inGrid })
      if (!command) return
      event.preventDefault()
      if (command === 'undo') void undoRef.current('undo')
      else if (command === 'redo') void undoRef.current('redo')
      else if (command === 'copy') copyCellRef.current()
      else if (command === 'paste')
        void navigator.clipboard.readText().then((text) => pasteCellRef.current(text))
      else if (command === 'clear') clearCellRef.current()
      else if (command === 'activate') activateRef.current()
      else
        setSelected((current) =>
          moveSelection(current, command.key, {
            rows: Math.max(boundsRef.current.rows, 1),
            columns: Math.max(boundsRef.current.columns, 1),
          }),
        )
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function openNewColumn(beforeId: string | undefined, point: ViewportAnchor) {
    setNewColumnType('text')
    setPopover({ kind: 'new-column', beforeId, ...point })
  }

  function cycleSort(columnId: string) {
    setSort((current) => {
      if (current?.columnId !== columnId) return { columnId, direction: 'asc' }
      if (current.direction === 'asc') return { columnId, direction: 'desc' }
      return null
    })
  }

  function chooseColumns(event: ReactMouseEvent, columnId: string) {
    if (event.shiftKey && columnAnchor) {
      const ids = visible.map((column) => column.id)
      const start = ids.indexOf(columnAnchor)
      const end = ids.indexOf(columnId)
      const [from, to] = start < end ? [start, end] : [end, start]
      setSelectedColumns(ids.slice(from, to + 1))
      return
    }
    if (event.metaKey || event.ctrlKey) {
      setSelectedColumns((current) =>
        current.includes(columnId)
          ? current.filter((id) => id !== columnId)
          : [...current, columnId],
      )
      setColumnAnchor(columnId)
      return
    }
    setSelectedColumns([columnId])
    setColumnAnchor(columnId)
  }

  const flags = historyFlags(tableId)
  void historyTick

  const columnCommands = useColumnCommands({
    t,
    i18n,
    navigate,
    openMenu,
    replaceMenu,
    queryClient,
    parentRef,
    mediaUploadRef,
    setCsvImportOpen,
    setCsvImportBusy,
    mediaUploadTarget,
    sort,
    setSort,
    setFilterInput,
    setFilters,
    checked,
    setChecked,
    selectedColumns,
    setSelectedColumns,
    selected,
    fill,
    setFill,
    setEditing,
    setRenamingColumn,
    popover,
    setPopover,
    setConfirm,
    relationTarget,
    setRelationTarget,
    relationCardinality,
    setFormatTarget,
    viewName,
    setViewName,
    sharedView,
    setDrawerRowId,
    setMediaPreview,
    filter,
    table,
    dataReadOnly,
    cellWritable,
    setLockPending,
    columns,
    visible,
    rules,
    projectId,
    rows,
    rowsRef,
    scheduleCell,
    applyMediaCell,
    footerConfig,
    views,
    projectTables,
    flags,
    tableId,
    refresh,
    undo,
    fetchRows,
    loadEveryRow,
    activateCell,
    openNewColumn,
    cycleSort,
  })
  const rowCommands = useRowCommands({
    t,
    i18n,
    navigate,
    openMenu,
    replaceMenu,
    queryClient,
    parentRef,
    mediaUploadRef,
    setCsvImportOpen,
    setCsvImportBusy,
    mediaUploadTarget,
    sort,
    setSort,
    setFilterInput,
    setFilters,
    checked,
    setChecked,
    selectedColumns,
    setSelectedColumns,
    selected,
    fill,
    setFill,
    setEditing,
    setRenamingColumn,
    popover,
    setPopover,
    setConfirm,
    relationTarget,
    setRelationTarget,
    relationCardinality,
    setFormatTarget,
    viewName,
    setViewName,
    sharedView,
    setDrawerRowId,
    setMediaPreview,
    filter,
    table,
    dataReadOnly,
    cellWritable,
    setLockPending,
    columns,
    visible,
    rules,
    projectId,
    rows,
    rowsRef,
    scheduleCell,
    applyMediaCell,
    footerConfig,
    views,
    projectTables,
    flags,
    tableId,
    refresh,
    undo,
    fetchRows,
    loadEveryRow,
    activateCell,
    openNewColumn,
    cycleSort,
  })
  const menuCommands = useTableMenus({
    t,
    i18n,
    navigate,
    openMenu,
    replaceMenu,
    queryClient,
    parentRef,
    mediaUploadRef,
    setCsvImportOpen,
    setCsvImportBusy,
    mediaUploadTarget,
    sort,
    setSort,
    setFilterInput,
    setFilters,
    checked,
    setChecked,
    selectedColumns,
    setSelectedColumns,
    selected,
    fill,
    setFill,
    setEditing,
    setRenamingColumn,
    popover,
    setPopover,
    setConfirm,
    relationTarget,
    setRelationTarget,
    relationCardinality,
    setFormatTarget,
    viewName,
    setViewName,
    sharedView,
    setDrawerRowId,
    setMediaPreview,
    filter,
    table,
    dataReadOnly,
    cellWritable,
    setLockPending,
    columns,
    visible,
    rules,
    projectId,
    rows,
    rowsRef,
    scheduleCell,
    applyMediaCell,
    footerConfig,
    views,
    projectTables,
    flags,
    tableId,
    refresh,
    undo,
    fetchRows,
    loadEveryRow,
    activateCell,
    openNewColumn,
    cycleSort,
    ...columnCommands,
    ...rowCommands,
  })
  const {
    createColumn,
    scheduleColumnName,
    saveColumnRules,
    saveRelation,
    deleteColumns,
    duplicateSelectedColumns,
    reorderColumns,
    hideColumn,
    applyDateMode,
    saveConfig,
    insertRow,
    requestMediaUpload,
    runCsvImport,
    uploadMediaToCell,
    openMediaPreview,
    paintRow,
    paintCell,
    paintRows,
    saveCellRules,
    deleteRows,
    duplicateSelectedRows,
    reorderRow,
    pasteTsv,
    beginFill,
    openColumnMenu,
    openRowMenu,
    openCellMenu,
    openTitleMenu,
    applyView,
    exportCsv,
    deleteThisTable,
    toggleTableLock,
    duplicateThisTable,
    saveView,
  } = { ...columnCommands, ...rowCommands, ...menuCommands }

  copyCellRef.current = () => {
    const column = visible[selected.column]
    const row = rows[selected.row]
    if (!column || !row) return
    void navigator.clipboard.writeText(
      displayCellValue(column, row.cells[column.id], i18n.language),
    )
  }
  clearCellRef.current = () => {
    const column = visible[selected.column]
    const row = rows[selected.row]
    if (!column || !row || !cellWritable(column)) return
    scheduleCell(row, column, '', 0)
    void sync.flush(`cell:${row.id}:${column.id}`)
  }
  pasteCellRef.current = (text: string) => {
    void pasteTsv(text)
  }

  beginFillRef.current = beginFill

  titleMenuRef.current = openTitleMenu

  const toolbarActions = useMemo(() => {
    if (!table) return null
    return {
      find: (el: HTMLElement) => setPopover({ kind: 'find', ...viewportAnchorFrom(el) }),
      exportCsv: () => void exportCsv(),
      importCsv: () => setCsvImportOpen(true),
      displayMode: (display.mode === 'chart' || display.mode === 'timeline'
        ? display.mode
        : 'grid') as 'grid' | 'chart' | 'timeline',
      setDisplayMode: (mode: 'grid' | 'chart' | 'timeline') =>
        setDisplay((current) => (current.mode === mode ? current : { ...current, mode })),
      views: (views.data?.views ?? []).map((view) => ({
        id: view.id,
        name: view.name,
        apply: () => applyView(view),
      })),
      saveView: (el: HTMLElement) => setPopover({ kind: 'view', ...viewportAnchorFrom(el) }),
      duplicateTable: () => void duplicateThisTable(),
      deleteTable: () =>
        setConfirm({
          title: t('deleteTableTitle'),
          body: t('deleteTableWarning', { name: table.name }),
          run: deleteThisTable,
        }),
      locked: Boolean(table.lockedAt),
      isMirror: Boolean(table.mirrorOfTableId),
      lockPending,
      onToggleLock: () => void toggleTableLock(),
    }
  }, [display.mode, table, tableId, t, views.data?.views, lockPending])

  useRegisterTableToolbar(toolbarActions)

  const columnSignature = JSON.stringify(
    columns.map((column) => [
      column.id,
      column.name,
      column.type,
      column.hidden,
      column.width,
      column.position,
      column.config.icon ?? null,
      column.config.variant ?? null,
      column.config.currency ?? null,
      column.config.style ?? null,
      column.config.toTableId ?? null,
      column.options.map((option) => [option.id, option.label]),
    ]),
  )
  const catalogSignature = JSON.stringify([
    (table?.tags ?? []).map((tag) => [tag.id, tag.name, tag.color]),
    (table?.statuses ?? []).map((status) => [status.id, status.name, status.color]),
    (membersQuery.data?.members ?? []).map((member) => [member.userId, member.username]),
  ])
  const rulesSignature = JSON.stringify(table?.formatRules ?? [])
  const targetSignature = JSON.stringify((targetRows.data?.rows ?? []).map((row) => row.id))
  const invalidSignature = JSON.stringify(invalidCells)
  const tableColumns = useMemo<ColumnDef<RowRecord>[]>(
    () =>
      createTableColumns({
        selectingAll,
        t,
        allChecked,
        checked,
        setChecked,
        setSelectingAll,
        loadEveryRow,
        openRowMenu,
        pressOrigin,
        pressTimer,
        rowsRef,
        insertRow,
        dragItem,
        setDropTarget,
        setDrawerRowId,
        columns,
        table,
        membersQuery,
        rules,
        editing,
        invalidFor,
        spotlight,
        visible,
        selected,
        fill,
        cellWritable,
        dataReadOnly,
        focusCell,
        activateCell,
        tableId,
        targetRows,
        scheduleCell,
        clearInvalid,
        setEditing,
        queryClient,
        setMediaLibrary,
        openMediaPreview,
        requestMediaUpload,
        mediaUploadingKey,
        applyMediaCell,
        applyDateMode,
        beginFillRef,
        openCellMenu,
        refresh,
      }),
    [
      allChecked,
      catalogSignature,
      checked,
      columnSignature,
      editing,
      fill,
      mediaUploadingKey,
      invalidSignature,
      rulesSignature,
      scheduleCell,
      applyMediaCell,
      invalidFor,
      clearInvalid,
      selected,
      spotlight,
      t,
      targetSignature,
      dataReadOnly,
    ],
  )
  const grid = useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  })
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 8,
  })
  useEffect(() => {
    if (!columnParam && !rowParam) return
    const key = `${tableId}|${columnParam}|${rowParam}`
    if (appliedLink.current === `done:${key}`) return
    const rowIndex = rowParam ? rows.findIndex((row) => row.id === rowParam) : -1
    if (rowParam && rowIndex < 0) {
      if (appliedLink.current === `stop:${key}` || rowsQuery.isPending) return
      if (!rowsQuery.hasNextPage) {
        appliedLink.current = `stop:${key}`
        return
      }
      if (rowsQuery.isFetchingNextPage) return
      const prefix = `page:${key}:`
      const attempts = appliedLink.current.startsWith(prefix)
        ? Number(appliedLink.current.slice(prefix.length))
        : 0
      if (attempts >= 12) {
        appliedLink.current = `stop:${key}`
        return
      }
      appliedLink.current = `${prefix}${attempts + 1}`
      void rowsQuery.fetchNextPage()
      return
    }
    if (columnParam && !columns.some((column) => column.id === columnParam)) return
    appliedLink.current = `done:${key}`
    setSpotlight({ rowId: rowParam, columnId: columnParam })
    if (rowIndex >= 0) virtualizer.scrollToIndex(rowIndex, { align: 'center' })
    if (columnParam) {
      const header = parentRef.current?.querySelector(
        `[data-column-id="${CSS.escape(columnParam)}"]`,
      )
      if (header instanceof HTMLElement)
        header.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => {
      flashTimer.current = null
      setSpotlight((current) =>
        current?.rowId === rowParam && current.columnId === columnParam ? null : current,
      )
    }, 1800)
  }, [
    columnParam,
    columns,
    rowParam,
    rows,
    rowsQuery.isPending,
    rowsQuery.hasNextPage,
    rowsQuery.isFetchingNextPage,
    rowsQuery.fetchNextPage,
    tableId,
    virtualizer,
  ])
  const virtualItems = virtualizer.getVirtualItems()
  const paddingTop = virtualItems[0]?.start ?? 0
  const paddingBottom = virtualizer.getTotalSize() - (virtualItems.at(-1)?.end ?? 0)
  const pageState = useRef({ hasNext: false, fetching: false, fetch: rowsQuery.fetchNextPage })
  pageState.current = {
    hasNext: rowsQuery.hasNextPage,
    fetching: rowsQuery.isFetchingNextPage,
    fetch: rowsQuery.fetchNextPage,
  }
  const gridReady = !tableQuery.isLoading && !rowsQuery.isLoading && Boolean(table)
  useEffect(() => {
    const parent = parentRef.current
    if (!parent) return
    const load = () => {
      const state = pageState.current
      const nearBottom = parent.scrollHeight - parent.scrollTop - parent.clientHeight < 288
      if (!nearBottom || !state.hasNext || state.fetching) return
      void state.fetch()
    }
    parent.addEventListener('scroll', load, { passive: true })
    return () => parent.removeEventListener('scroll', load)
  }, [display.mode, gridReady])
  useEffect(() => {
    const parent = parentRef.current
    if (!parent) return
    const measure = () => setViewportWidth(parent.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [display.mode, gridReady])

  if (tableQuery.isLoading || rowsQuery.isLoading)
    return (
      <section className="p-4 md:p-6">
        <LoadingBlock />
      </section>
    )
  if (tableQuery.isError || rowsQuery.isError || !table) {
    const message =
      (tableQuery.error as Error | null)?.message ??
      (rowsQuery.error as Error | null)?.message ??
      t('error')
    return (
      <section className="p-4 md:p-6">
        <ErrorState message={message} />
      </section>
    )
  }

  const columnsWidth = columns.reduce((sum, column) => sum + (widths[column.id] ?? column.width), 0)
  const filler = Math.max(ADD_COLUMN_WIDTH, viewportWidth - GUTTER_WIDTH - columnsWidth)

  return (
    <section
      className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-0 pt-0 md:px-6"
      style={{ WebkitTouchCallout: 'none' }}
    >
      <CsvImportDialog
        open={csvImportOpen}
        busy={csvImportBusy}
        onClose={() => setCsvImportOpen(false)}
        onImport={runCsvImport}
      />
      <FileUpload
        ref={mediaUploadRef}
        variant="compact"
        accept={MEDIA_UPLOAD_ACCEPT}
        ariaLabel={t('mediaUpload')}
        onFilesSelected={(files) => {
          const file = files[0]
          const target = mediaUploadTarget.current
          mediaUploadTarget.current = null
          if (!file || !target) return
          const column = columns.find((item) => item.id === target.columnId)
          if (!column) return
          const key = `${target.rowId}:${target.columnId}`
          setMediaUploadingKey(key)
          void uploadMediaToCell(target.rowId, column, file).finally(() => {
            setMediaUploadingKey((current) => (current === key ? null : current))
          })
        }}
      />
      <div className="flex min-h-0 flex-1 flex-col border border-border bg-card">
        {readOnlyReason === 'mirror' && table.mirrorSource ? (
          <p className="border-b border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {t('mirrorBanner', {
              project: table.mirrorSource.projectName,
              table: table.mirrorSource.tableName,
            })}
          </p>
        ) : readOnlyReason === 'locked' ? (
          <p className="border-b border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {t('lockedTableBanner')}
          </p>
        ) : null}
        {display.mode === 'chart' ? (
          <ChartView
            columns={columns}
            rows={rows}
            tags={table.tags ?? []}
            statuses={table.statuses ?? []}
            chart={display.chart}
            truncated={rows.length >= displayRowCap && Boolean(rowsQuery.hasNextPage)}
            loading={Boolean(rowsQuery.hasNextPage) && rows.length < displayRowCap}
            onChange={(chart) => setDisplay((current) => ({ ...current, chart }))}
          />
        ) : display.mode === 'timeline' ? (
          <TimelineView
            columns={columns}
            rows={rows}
            tags={table.tags ?? []}
            statuses={table.statuses ?? []}
            members={membersQuery.data?.members ?? []}
            timeline={display.timeline}
            readOnly={dataReadOnly}
            truncated={rows.length >= displayRowCap && Boolean(rowsQuery.hasNextPage)}
            loading={Boolean(rowsQuery.hasNextPage) && rows.length < displayRowCap}
            onChange={(timeline) => setDisplay((current) => ({ ...current, timeline }))}
            onWrite={(row, column, value) => {
              scheduleCell(row, column, value, 0)
              void sync.flush(`cell:${row.id}:${column.id}`)
            }}
          />
        ) : (
          <div
            ref={parentRef}
            tabIndex={0}
            className="min-h-0 flex-1 overflow-auto"
            onPaste={(event: ClipboardEvent<HTMLDivElement>) => {
              if (editing) return
              const text = event.clipboardData.getData('text/plain')
              if (!text.includes('\t') && !text.includes('\n')) return
              event.preventDefault()
              void pasteTsv(text)
            }}
          >
            <table
              className="table-grid table-fixed border-collapse text-sm"
              style={{ width: GUTTER_WIDTH + columnsWidth + filler }}
            >
              <thead className="sticky top-0 z-20">
                <tr>
                  <th
                    className={`sticky left-0 z-30 h-10 p-0 text-left ${TABLE_HEADER_CELL}`}
                    style={{ width: GUTTER_WIDTH }}
                  >
                    {flexRender(
                      grid.getHeaderGroups()[0]?.headers[0]?.column.columnDef.header,
                      grid.getHeaderGroups()[0]?.headers[0]?.getContext(),
                    )}
                  </th>
                  {columns.map((column) => {
                    if (column.hidden) {
                      return (
                        <th
                          key={column.id}
                          data-column-id={column.id}
                          className={`h-10 p-0 ${TABLE_HEADER_CELL}`}
                          style={{ width: widths[column.id] ?? column.width }}
                        >
                          <button
                            type="button"
                            aria-label={t('showColumn')}
                            className="inline-flex h-10 w-full items-center justify-center text-muted-foreground hover:text-foreground"
                            onClick={() => void hideColumn(column, false)}
                          >
                            <Eye className="size-3.5" />
                          </button>
                        </th>
                      )
                    }
                    const activeSort = sort?.columnId === column.id
                    const filtered = Boolean(
                      filterInput[column.id] &&
                      (filterInput[column.id].op === 'empty' ||
                        filterInput[column.id].op === 'not_empty' ||
                        filterInput[column.id].value),
                    )
                    return (
                      <th
                        key={column.id}
                        data-column-id={column.id}
                        className={`group relative h-10 overflow-visible px-2 text-left font-medium ${selectedColumns.includes(column.id) ? 'bg-accent' : TABLE_HEADER_CELL} ${spotlight?.columnId === column.id && !spotlight.rowId ? 'ring-2 ring-inset ring-primary' : ''}`}
                        style={{ width: widths[column.id] ?? column.width }}
                        onDragOver={(event: DragEvent) => {
                          const from = dragItem.current
                          if (!from || from.kind !== 'column') return
                          event.preventDefault()
                          const next = beforeDropEdge(
                            columns.map((item) => item.id),
                            from.id,
                            column.id,
                          )
                            ? column.id
                            : null
                          setDropTarget((current) => {
                            if (next === null) return current?.kind === 'column' ? null : current
                            if (current?.kind === 'column' && current.id === next) return current
                            return { kind: 'column', id: next }
                          })
                        }}
                        onDrop={(event: DragEvent) => {
                          event.preventDefault()
                          const payload = event.dataTransfer.getData('text/plain')
                          dragItem.current = null
                          setDropTarget(null)
                          if (!payload.startsWith('column:')) return
                          void reorderColumns(
                            moveIdBefore(
                              columns.map((item) => item.id),
                              payload.slice(7),
                              column.id,
                            ),
                          )
                        }}
                        onClick={(event) => chooseColumns(event, column.id)}
                        onContextMenu={(event) => openColumnMenu(event, column)}
                        onPointerDown={(event) => {
                          if (event.pointerType === 'mouse') return
                          const point = { x: event.clientX, y: event.clientY }
                          pressOrigin.current = point
                          window.clearTimeout(pressTimer.current)
                          pressTimer.current = window.setTimeout(() => {
                            openColumnMenu(
                              {
                                preventDefault() {},
                                clientX: point.x,
                                clientY: point.y,
                              } as ReactMouseEvent,
                              column,
                            )
                          }, 500)
                        }}
                        onPointerMove={(event) => {
                          if (
                            Math.hypot(
                              event.clientX - pressOrigin.current.x,
                              event.clientY - pressOrigin.current.y,
                            ) > 10
                          ) {
                            window.clearTimeout(pressTimer.current)
                          }
                        }}
                        onPointerUp={() => window.clearTimeout(pressTimer.current)}
                        onPointerCancel={() => window.clearTimeout(pressTimer.current)}
                      >
                        {dropTarget?.kind === 'column' && dropTarget.id === column.id ? (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-y-0 left-0 z-20 w-0.5 bg-primary"
                          />
                        ) : null}
                        <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                          <span
                            role="button"
                            tabIndex={-1}
                            draggable
                            aria-label={t('reorder')}
                            className="inline-flex shrink-0 cursor-grab text-muted-foreground"
                            onMouseDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                            onDragStart={(event) => {
                              event.stopPropagation()
                              dragItem.current = { kind: 'column', id: column.id }
                              event.dataTransfer.setData('text/plain', `column:${column.id}`)
                              event.dataTransfer.effectAllowed = 'move'
                            }}
                            onDragEnd={() => {
                              dragItem.current = null
                              setDropTarget(null)
                            }}
                          >
                            <GripVertical className="size-3.5" />
                          </span>
                          <button
                            type="button"
                            aria-label={t('icon')}
                            className="text-muted-foreground"
                            onClick={(event) => {
                              event.stopPropagation()
                              setPopover({ kind: 'icon', columnId: column.id, ...anchor(event) })
                            }}
                          >
                            <ColumnIcon
                              name={String(
                                column.config.icon ?? defaultIcon(column.type, column.config),
                              )}
                            />
                          </button>
                          {renamingColumn === column.id ? (
                            <QuietInput
                              autoFocus
                              label={t('rename')}
                              className="h-9 min-w-0 flex-1 bg-transparent leading-9 outline-none"
                              value={column.name}
                              onDraft={(next) => scheduleColumnName(column, next)}
                              onFlush={() => {
                                void sync
                                  .flush(`column:${column.id}:name`)
                                  .catch(() => showEditError(t('error')))
                                  .finally(() => setRenamingColumn(null))
                              }}
                              onCancel={() => {
                                sync.cancel(`column:${column.id}:name`)
                                setRenamingColumn(null)
                              }}
                            />
                          ) : (
                            <ColumnTitle
                              name={column.name}
                              type={column.type}
                              onClick={(event) => {
                                event.stopPropagation()
                                if (event.shiftKey || event.metaKey || event.ctrlKey) {
                                  chooseColumns(event, column.id)
                                  return
                                }
                                setRenamingColumn(column.id)
                              }}
                            />
                          )}
                          <button
                            type="button"
                            data-header-control
                            aria-label={t('sort')}
                            className={` p-0.5 ${activeSort ? 'text-foreground' : 'text-muted-foreground'}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              cycleSort(column.id)
                            }}
                          >
                            {activeSort && sort?.direction === 'desc' ? (
                              <ArrowDown className="size-3.5" />
                            ) : activeSort ? (
                              <ArrowUp className="size-3.5" />
                            ) : (
                              <ArrowUpDown className="size-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            data-header-control
                            aria-label={t('filter')}
                            className={` p-0.5 ${filtered ? 'text-foreground' : 'text-muted-foreground'}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              setPopover({ kind: 'filter', columnId: column.id, ...anchor(event) })
                            }}
                          >
                            <Filter className="size-3.5" />
                          </button>
                        </div>
                        <div
                          role="separator"
                          aria-label={t('resize')}
                          className="absolute -right-1 top-5 z-30 h-[calc(100%-1.25rem)] w-2 cursor-col-resize"
                          onPointerDown={(event) => {
                            if (event.button !== 0) return
                            event.preventDefault()
                            event.stopPropagation()
                            const handle = event.currentTarget
                            handle.setPointerCapture(event.pointerId)
                            const startX = event.clientX
                            const start = widths[column.id] ?? column.width
                            const move = (ev: PointerEvent) => {
                              const next = Math.max(80, Math.round(start + ev.clientX - startX))
                              setWidths((current) => {
                                const saved = { ...current, [column.id]: next }
                                localStorage.setItem(
                                  `dv-col-widths:${tableId}`,
                                  JSON.stringify(saved),
                                )
                                return saved
                              })
                            }
                            const up = (ev: PointerEvent) => {
                              if (handle.hasPointerCapture(ev.pointerId))
                                handle.releasePointerCapture(ev.pointerId)
                              handle.removeEventListener('pointermove', move)
                              handle.removeEventListener('pointerup', up)
                            }
                            handle.addEventListener('pointermove', move)
                            handle.addEventListener('pointerup', up)
                          }}
                        />
                        {!dataReadOnly ? (
                          <button
                            type="button"
                            data-header-control
                            aria-label={t('insertColumn')}
                            className="absolute -right-1.5 -bottom-1.5 z-40 hidden h-3 w-3 items-center justify-center border border-border bg-card max-md:flex md:group-hover:flex"
                            onClick={(event) => {
                              event.stopPropagation()
                              openNewColumn(
                                columns[columns.findIndex((item) => item.id === column.id) + 1]?.id,
                                anchor(event),
                              )
                            }}
                          >
                            <Plus className="size-3" />
                          </button>
                        ) : null}
                      </th>
                    )
                  })}
                  <th className={`p-0 align-start ${TABLE_HEADER_CELL}`} style={{ width: filler }}>
                    {!dataReadOnly ? (
                      <button
                        type="button"
                        aria-label={t('insertColumn')}
                        className="inline-flex h-7 w-7 items-center justify-center hover:bg-accent"
                        onClick={(event) => openNewColumn(undefined, anchor(event))}
                      >
                        <Plus className="size-4" />
                      </button>
                    ) : null}
                  </th>
                </tr>
              </thead>
              <tbody>
                {emptyGridKind(rows.length, Boolean(filter || search)) === 'empty' ? (
                  <tr>
                    <td colSpan={visible.length + 2} className="p-0">
                      <EmptyState title={t('emptyRows')} body={t('emptyRowsBody')} />
                    </td>
                  </tr>
                ) : null}
                {emptyGridKind(rows.length, Boolean(filter || search)) === 'filtered' ? (
                  <tr>
                    <td colSpan={visible.length + 2} className="p-0">
                      <div className="flex flex-col items-center gap-2 py-8">
                        <EmptyState title={t('noResults')} body={t('noResultsBody')} />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setFilterInput({})
                            setFilters({})
                            setSearchInput('')
                            setSearch('')
                          }}
                        >
                          {t('clearFilter')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : null}
                {paddingTop > 0 ? <tr style={{ height: paddingTop }} /> : null}
                {virtualItems.map((virtualRow) => {
                  const row = grid.getRowModel().rows[virtualRow.index]
                  if (!row) return null
                  return (
                    <tr
                      key={row.id}
                      className={`group ${spotlight?.rowId === row.original.id && !spotlight.columnId ? 'bg-accent' : ''}`}
                      onDragOver={(event) => {
                        const from = dragItem.current
                        if (!from || from.kind !== 'row') return
                        event.preventDefault()
                        const next = beforeDropEdge(
                          rows.map((item) => item.id),
                          from.id,
                          row.original.id,
                        )
                          ? row.original.id
                          : null
                        setDropTarget((current) => {
                          if (next === null) return current?.kind === 'row' ? null : current
                          if (current?.kind === 'row' && current.id === next) return current
                          return { kind: 'row', id: next }
                        })
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        const payload = event.dataTransfer.getData('text/plain')
                        dragItem.current = null
                        setDropTarget(null)
                        if (!payload.startsWith('row:')) return
                        if (sort) setSort(null)
                        void reorderRow(payload.slice(4), row.original.id)
                      }}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const bodyColumn = columns.find((item) => item.id === cell.column.id)
                        const dateCellEditing =
                          bodyColumn &&
                          editing === `${row.original.id}:${bodyColumn.id}` &&
                          isDateColumnType(bodyColumn.type)
                        return (
                          <td
                            key={cell.id}
                            className={`relative ${dateCellEditing ? 'overflow-visible' : 'overflow-hidden'} ${TABLE_GRID_DIVIDER} p-0 ${cell.column.id === 'select' ? `sticky left-0 z-10 ${spotlight?.rowId === row.original.id && !spotlight.columnId ? 'bg-accent' : 'bg-card'}` : ''}`}
                          >
                            {dropTarget?.kind === 'column' && dropTarget.id === cell.column.id ? (
                              <span
                                aria-hidden
                                className="pointer-events-none absolute inset-y-0 left-0 z-20 w-0.5 bg-primary"
                              />
                            ) : null}
                            {dropTarget?.kind === 'row' && dropTarget.id === row.original.id ? (
                              <span
                                aria-hidden
                                className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 bg-primary"
                              />
                            ) : null}
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        )
                      })}
                      <td className="border-b border-border" />
                    </tr>
                  )
                })}
                {paddingBottom > 0 ? <tr style={{ height: paddingBottom }} /> : null}
                {footerConfig.enabled ? (
                  <tr>
                    <td className="h-9 border-r border-t border-border" />
                    {columns.map((column) => {
                      if (column.hidden) {
                        return (
                          <td key={column.id} className="h-9 border-r border-t border-border" />
                        )
                      }
                      const calc = footerConfig.columns?.[column.id]
                      const stats = footerQuery.data?.footer?.[column.id]
                      return (
                        <td
                          key={column.id}
                          className="h-9 border-r border-t border-border px-2 text-xs text-muted-foreground"
                        >
                          {calc && stats ? (
                            <>
                              <Badge>{t(calc)}</Badge> {footerValue(calc, stats)}
                            </>
                          ) : calc && footerQuery.isLoading ? (
                            t('footerLoading')
                          ) : (
                            ''
                          )}
                        </td>
                      )
                    })}
                    <td className="border-t border-border" />
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
        {display.mode === 'chart' || display.mode === 'timeline' ? null : (
          <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-t border-border bg-card px-2">
            {!dataReadOnly ? (
              <button
                type="button"
                className="flex h-9 shrink-0 items-center gap-1 whitespace-nowrap text-muted-foreground hover:text-foreground"
                onClick={() => void insertRow()}
              >
                <Plus className="size-3.5" />
                {t('insertRow')}
              </button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="shrink-0"
              disabled={!flags.canUndo}
              aria-label={t('undo')}
              title={t('undo')}
              onClick={() => void undo('undo')}
            >
              <Undo2 className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="shrink-0"
              disabled={!flags.canRedo}
              aria-label={t('redo')}
              title={t('redo')}
              onClick={() => void undo('redo')}
            >
              <Redo2 className="size-3.5" />
            </Button>
            {checked.length > 0 || selectedColumns.length > 0 ? (
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <span className="whitespace-nowrap text-sm">
                  {selectionKind(checked.length, selectedColumns.length) === 'both'
                    ? t('selectedRowsAndColumns', {
                        rows: checked.length,
                        columns: selectedColumns.length,
                      })
                    : selectionKind(checked.length, selectedColumns.length) === 'columns'
                      ? t('selectedColumns', { count: selectedColumns.length })
                      : t('selectedRows', { count: checked.length })}
                </span>
                {checked.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 whitespace-nowrap"
                    onClick={() => void duplicateSelectedRows(checked)}
                  >
                    {t('duplicateRows')}
                  </Button>
                ) : null}
                {selectedColumns.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 whitespace-nowrap"
                    onClick={() => void duplicateSelectedColumns(selectedColumns)}
                  >
                    {t('duplicateColumns')}
                  </Button>
                ) : null}
                {checked.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 whitespace-nowrap"
                    onClick={(event) =>
                      setPopover({
                        kind: 'row-color',
                        rowId: rows.find((row) => checked.includes(row.id))?.id,
                        ...anchor(event),
                      })
                    }
                  >
                    {t('rowColor')}
                  </Button>
                ) : null}
                {checked.length > 0 ? (
                  <Button
                    type="button"
                    variant="danger"
                    className="shrink-0 whitespace-nowrap"
                    onClick={() => void deleteRows(checked)}
                  >
                    {t('deleteRows')}
                  </Button>
                ) : null}
                {selectedColumns.length > 0 ? (
                  <Button
                    type="button"
                    variant="danger"
                    className="shrink-0 whitespace-nowrap"
                    onClick={() => void deleteColumns(selectedColumns)}
                  >
                    {t('deleteColumns')}
                  </Button>
                ) : null}
                <button
                  type="button"
                  aria-label={t('close')}
                  className="text-muted-foreground"
                  onClick={() => {
                    setChecked([])
                    setSelectedColumns([])
                  }}
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
      <GridPopovers
        popover={popover}
        columns={columns}
        rows={rows}
        t={t}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        tableId={tableId}
        setSearch={setSearch}
        newColumnType={newColumnType}
        setNewColumnType={setNewColumnType}
        createColumn={createColumn}
        dataReadOnly={dataReadOnly}
        queryClient={queryClient}
        refresh={refresh}
        filterInput={filterInput}
        setFilterInput={setFilterInput}
        setFilters={setFilters}
        i18n={i18n}
        checked={checked}
        paintRows={paintRows}
        paintRow={paintRow}
        paintCell={paintCell}
        relationCardinality={relationCardinality}
        setRelationCardinality={setRelationCardinality}
        relationTarget={relationTarget}
        setRelationTarget={setRelationTarget}
        saveRelation={saveRelation}
        projectTables={projectTables}
        saveConfig={saveConfig}
        setPopover={setPopover}
        viewName={viewName}
        setViewName={setViewName}
        saveView={saveView}
        sharedView={sharedView}
        setSharedView={setSharedView}
      />
      <NotesDrawer
        tableId={tableId}
        row={rows.find((row) => row.id === drawerRowId) ?? null}
        columns={columns}
        tags={table?.tags ?? []}
        statuses={table?.statuses ?? []}
        members={membersQuery.data?.members ?? []}
        readOnly={dataReadOnly}
        readOnlyReason={readOnlyReason}
        onMediaLibrary={(rowId, columnId, existingIds) =>
          setMediaLibrary({ rowId, columnId, existingIds })
        }
        onMediaPreview={(file, rowId, columnId) => void openMediaPreview(file, rowId, columnId)}
        onMediaRequestUpload={(rowId, columnId) => requestMediaUpload(rowId, columnId)}
        mediaUploadingKey={mediaUploadingKey}
        onDateMode={(column, patch) => void applyDateMode(column, patch)}
        onCreated={(kind, item) =>
          patchCachedTable(queryClient, tableId, (current) => ({
            ...current,
            tags:
              kind === 'tag'
                ? [...(current.tags ?? []).filter((tag) => tag.id !== item.id), item]
                : current.tags,
            statuses:
              kind === 'status'
                ? [...(current.statuses ?? []).filter((status) => status.id !== item.id), item]
                : current.statuses,
          }))
        }
        onOptionChange={(columnId, option, deleted) => {
          patchCachedTable(queryClient, tableId, (current) => ({
            ...current,
            columns: current.columns?.map((item) =>
              item.id === columnId ? mergeColumnOption(item, option, deleted) : item,
            ),
          }))
          if (deleted) void refresh()
        }}
        onOpenFormula={(rowId, columnId, columnName) => {
          setEditing(null)
          openFormula(rowId, columnId, columnName)
          const drawer = document.querySelector('[data-notes-drawer]')
          if (!drawer) return
          const edge = drawer.getBoundingClientRect().left
          const frame = useFormulaWindow.getState()
          if (frame.x + frame.width > edge - 8) {
            useFormulaWindow.getState().move(Math.max(8, edge - frame.width - 12), frame.y)
          }
        }}
        onClose={() => setDrawerRowId(null)}
      />
      <MediaLibraryDialog
        open={Boolean(mediaLibrary)}
        onClose={() => setMediaLibrary(null)}
        existingIds={mediaLibrary?.existingIds ?? []}
        onInsert={(added) => {
          if (!mediaLibrary) return
          const column = columns.find((item) => item.id === mediaLibrary.columnId)
          const row =
            readCachedRow(queryClient, tableId, mediaLibrary.rowId) ??
            rows.find((item) => item.id === mediaLibrary.rowId)
          if (!row || !column) return
          void applyMediaCell(row, column, mergeMediaIntoCell(row.cells[column.id], added)).then(
            () => setMediaLibrary(null),
          )
        }}
      />
      <MediaPreviewDrawer
        file={mediaPreview?.file ?? null}
        onClose={() => setMediaPreview(null)}
        onDisconnect={
          mediaPreview
            ? () => {
                const row = rows.find((item) => item.id === mediaPreview.rowId)
                const column = columns.find((item) => item.id === mediaPreview.columnId)
                if (!row || !column) return
                const ids = normalizeMediaCellValue(row.cells[column.id])?.fileIds ?? []
                const next = ids.filter((id) => id !== mediaPreview.file.id)
                void applyMediaCell(row, column, next.length ? { fileIds: next } : null).then(() =>
                  setMediaPreview(null),
                )
              }
            : undefined
        }
      />
      {formatTarget ? (
        <ConditionalDialog
          key={`${formatTarget.columnId}:${formatTarget.rowId ?? 'column'}`}
          tableId={tableId}
          columnId={formatTarget.columnId}
          columnName={columns.find((column) => column.id === formatTarget.columnId)?.name ?? ''}
          rowLabel={
            formatTarget.rowId
              ? `#${rows.find((row) => row.id === formatTarget.rowId)?.rowNumber ?? ''}`
              : undefined
          }
          rules={
            formatTarget.rowId
              ? (rows.find((row) => row.id === formatTarget.rowId)?.formats?.[
                  formatTarget.columnId
                ] ?? [])
              : rules.filter((rule) => rule.columnId === formatTarget.columnId)
          }
          onClose={() => setFormatTarget(null)}
          onSave={(drafts) => {
            if (formatTarget.rowId) {
              const row = rows.find((item) => item.id === formatTarget.rowId)
              if (!row) return Promise.resolve()
              return saveCellRules(row, formatTarget.columnId, drafts)
            }
            return saveColumnRules(formatTarget.columnId, drafts)
          }}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title ?? ''}
        body={confirm?.body ?? ''}
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const pending = confirm
          setConfirm(null)
          if (pending) void pending.run()
        }}
      />
    </section>
  )
}
