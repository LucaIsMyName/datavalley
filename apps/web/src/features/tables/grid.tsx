import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ApiClientError,
  type Column,
  type RowRecord,
  type TableRecord,
} from '@datavalley/api-client'
import { matchesCondition } from '@datavalley/formula-engine'
import {
  conditionalStyle,
  moveSelection,
  paintSwatch,
  type FilterNode,
  type FilterOperator,
  type FormatRule,
} from '@datavalley/shared'
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpDown,
  ArrowUpToLine,
  Bookmark,
  ClipboardPaste,
  Copy,
  Download,
  Eraser,
  Eye,
  Filter,
  GripVertical,
  ListChecks,
  Palette,
  Pencil,
  Plus,
  Redo2,
  Save,
  Search,
  Sigma,
  Star,
  StickyNote,
  Trash2,
  Undo2,
  Upload,
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
import { toast } from 'sonner'
import { AnchoredLayer } from '../../components/anchored-layer'
import { useContextMenu } from '../../components/context-menu'
import { QuietInput } from '../../components/quiet-input'
import { SelectField } from '../../components/ui/select'
import { ConfirmDialog } from '../../components/confirm-dialog'
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { Input } from '../../components/ui/input'
import { EmptyState, ErrorState, LoadingBlock } from '../../components/states'
import { api } from '../../lib/api'
import type { ViewportAnchor } from '../../lib/place-in-viewport'
import { sync } from '../../lib/sync'
import { invalidateFooter, mapCachedRows, patchCachedTable, readCachedRow } from './cache'
import { cellFormatError } from './cell-format'
import { buildColumnHeaderMenu, COLUMN_TYPES } from './column-menu'
import { ConditionalDialog } from './conditional-dialog'
import { presentFormatRow } from './format-values'
import { CellEditor } from './cells'
import { beforeDropEdge } from './drop-place'
import { editFailureMessage } from './edit-error'
import {
  cardinalityKey,
  emptyGridKind,
  filterOperatorKey,
  rowTint,
  selectionKind,
} from './grid-ux'
import { fillTargets } from './fill-range'
import { useFormulaWindow } from '../../stores/formula-window'
import { formatFormulaValue } from './formula-help'
import { COLUMN_ICONS, ColumnIcon, defaultIcon } from './icons'
import { NotesDrawer } from './notes'
import { Swatches } from './swatches'
import { registerTableMenu } from './table-menu'
import { useRegisterTableToolbar, viewportAnchorFrom } from './table-toolbar'
import {
  historyFlags,
  pushCommand,
  redoTable,
  undoTable,
  type ColumnSnap,
  type RowSnap,
} from './history'

const GUTTER_WIDTH = 60
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

function showCell(value: unknown) {
  return formatFormulaValue(value)
}

function writable(column: Column) {
  return column.type !== 'formula' && column.type !== 'lookup'
}

function fillable(column: Column) {
  return column.type !== 'lookup' && column.type !== 'row_id'
}

function operatorsFor(type: string) {
  if (['number', 'currency', 'date', 'datetime'].includes(type))
    return ['eq', 'gt', 'lt', 'empty', 'not_empty']
  if (type === 'checkbox') return ['eq', 'empty', 'not_empty']
  if (['select', 'radio', 'multi_select', 'relation'].includes(type))
    return ['eq', 'neq', 'empty', 'not_empty']
  return ['eq', 'contains', 'starts_with', 'empty', 'not_empty']
}

function nextLabel(names: string[], base: string) {
  if (!names.includes(base)) return base
  let index = 2
  while (names.includes(`${base} ${index}`)) index += 1
  return `${base} ${index}`
}

function moveIdBefore(ids: string[], fromId: string, toId: string) {
  if (fromId === toId) return ids
  const next = ids.filter((id) => id !== fromId)
  const index = next.indexOf(toId)
  if (index < 0) return ids
  next.splice(index, 0, fromId)
  return next
}

function filtersFrom(node: FilterNode | null | undefined) {
  const next: Record<string, { op: string; value: string }> = {}
  const list = node && 'conditions' in node ? node.conditions : node ? [node] : []
  for (const condition of list) {
    if (!condition || !('columnId' in condition)) continue
    next[condition.columnId] = {
      op: condition.op,
      value: condition.value == null ? '' : String(condition.value),
    }
  }
  return next
}

function activeFilter(filters: Record<string, { op: string; value: string }>): FilterNode | null {
  const conditions: FilterNode[] = Object.entries(filters)
    .filter(
      ([, filter]) => filter.op === 'empty' || filter.op === 'not_empty' || filter.value !== '',
    )
    .map(([columnId, filter]) => ({
      op: filter.op as FilterOperator,
      columnId,
      value: filter.value,
    }))
  if (conditions.length === 0) return null
  if (conditions.length === 1) return conditions[0]
  return { op: 'and', conditions }
}

function showEditError(message: string) {
  toast.error(message, { id: 'table-edit-error' })
}

function anchor(event: ReactMouseEvent): ViewportAnchor {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}

function ColumnTitle({ name, type, onClick }: { name: string; type: string; onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLButtonElement>(null)
  const [tip, setTip] = useState<ViewportAnchor | null>(null)
  function show() {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    setTip({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom })
  }
  return (
    <>
      <button
        ref={ref}
        type="button"
        className="min-w-0 flex-1 truncate text-left"
        onMouseEnter={show}
        onMouseLeave={() => setTip(null)}
        onFocus={show}
        onBlur={() => setTip(null)}
        onClick={onClick}
      >
        {name}
      </button>
      {tip ? (
        <AnchoredLayer
          anchor={tip}
          prefer="above"
          align="start"
          role="tooltip"
          className="pointer-events-none w-max max-w-56 border border-border bg-card px-2 py-1 text-left text-xs font-normal leading-4 text-foreground shadow-md"
        >
          {t(`type_${type}`)}
        </AnchoredLayer>
      ) : null}
    </>
  )
}

export function TableScreen({ tableId }: { tableId: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const openMenu = useContextMenu()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const columnParam = searchParams.get('column') ?? ''
  const rowParam = searchParams.get('row') ?? ''
  const parentRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const pressTimer = useRef(0)
  const pressOrigin = useRef({ x: 0, y: 0 })
  const dragItem = useRef<{ kind: 'column' | 'row'; id: string } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ kind: 'column' | 'row'; id: string } | null>(null)
  const [notice, setNotice] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const appliedLink = useRef('')
  const flashTimer = useRef<number | null>(null)
  const [sort, setSort] = useState<{ columnId: string; direction: 'asc' | 'desc' } | null>(null)
  const [filterInput, setFilterInput] = useState<Record<string, { op: string; value: string }>>({})
  const [filters, setFilters] = useState<Record<string, { op: string; value: string }>>({})
  const cellBaseline = useRef(new Map<string, unknown>())
  const serverReject = useRef(new Map<string, string>())
  const appliedState = useRef<string | null>(null)
  const [checked, setChecked] = useState<string[]>([])
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [spotlight, setSpotlight] = useState<{ rowId: string; columnId: string } | null>(null)
  const [columnAnchor, setColumnAnchor] = useState<string | null>(null)
  const [selected, setSelected] = useState({ row: 0, column: 0 })
  const [fill, setFill] = useState<{ columnId: string; from: number; to: number } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [invalidCells, setInvalidCells] = useState<
    Record<string, { text: string; message: string }>
  >({})
  const [newColumnType, setNewColumnType] = useState('text')
  const [stateReady, setStateReady] = useState(false)
  const [renamingColumn, setRenamingColumn] = useState<string | null>(null)
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [relationTarget, setRelationTarget] = useState('')
  const [relationCardinality, setRelationCardinality] = useState('many_to_one')
  const [formatTarget, setFormatTarget] = useState<{ columnId: string; rowId?: string } | null>(null)
  const [viewName, setViewName] = useState('')
  const [sharedView, setSharedView] = useState(false)
  const [historyTick, setHistoryTick] = useState(0)
  const [widths, setWidths] = useState<Record<string, number>>({})
  const [drawerRowId, setDrawerRowId] = useState<string | null>(null)
  const [selectingAll, setSelectingAll] = useState(false)
  const filter = useMemo(() => activeFilter(filters), [filters])
  const filterKey = JSON.stringify(filter)

  const tableQuery = useQuery({
    queryKey: ['table', tableId],
    queryFn: () => api.request<{ table: TableRecord }>(`/tables/${tableId}`),
  })
  const table = tableQuery.data?.table
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
    if (column.type === 'formula') {
      openFormula(row.id, column.id, column.name)
      return
    }
    if (!fillable(column) || column.type === 'checkbox') return
    setEditing(`${row.id}:${column.id}`)
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
  const rowsRef = useRef(rows)
  rowsRef.current = rows
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
    setStateReady(true)
  }, [table, tableId, tableState.data, tableState.isSuccess])
  useEffect(() => {
    if (!stateReady || appliedState.current !== tableId) return
    const timer = window.setTimeout(() => {
      void api
        .request(`/tables/${tableId}/state`, {
          method: 'PUT',
          body: JSON.stringify({ sort, filter }),
        })
        .catch(() => showEditError(t('error')))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [filter, sort, stateReady, t, tableId])
  const projectTables = useQuery({
    queryKey: ['tables', projectId],
    enabled: popover?.kind === 'relation' && Boolean(projectId),
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
      if ((event.target as HTMLElement | null)?.closest('[data-popover], [role="listbox"], [data-radix-popper-content-wrapper]')) return
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
    setNotice('')
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
  const beginFillRef = useRef<(event: ReactPointerEvent, rowIndex: number, column: Column) => void>(() => {})
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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !typing) {
        event.preventDefault()
        void undoRef.current(event.shiftKey ? 'redo' : 'undo')
        return
      }
      const inGrid = Boolean(parentRef.current?.contains(document.activeElement))
      if (!typing && inGrid && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        copyCellRef.current()
        return
      }
      if (!typing && inGrid && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        void navigator.clipboard.readText().then((text) => pasteCellRef.current(text))
        return
      }
      if (!typing && inGrid && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault()
        clearCellRef.current()
        return
      }
      if (!typing && inGrid && event.key === 'Enter') {
        event.preventDefault()
        activateRef.current()
        return
      }
      if (
        !typing &&
        inGrid &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
      ) {
        event.preventDefault()
        const bounds = boundsRef.current
        setSelected((current) =>
          moveSelection(current, event.key, {
            rows: Math.max(bounds.rows, 1),
            columns: Math.max(bounds.columns, 1),
          }),
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function openNewColumn(beforeId: string | undefined, point: ViewportAnchor) {
    setNewColumnType('text')
    setPopover({ kind: 'new-column', beforeId, ...point })
  }

  async function createColumn(type: string) {
    const beforeId = popover?.kind === 'new-column' ? popover.beforeId : undefined
    const point = popover
      ? { left: popover.left, top: popover.top, right: popover.right, bottom: popover.bottom }
      : { left: 16, top: 16, right: 16, bottom: 16 }
    setPopover(null)
    const created = await api.request<{ column: Column }>(`/tables/${tableId}/columns`, {
      method: 'POST',
      body: JSON.stringify({
        name: nextLabel(
          columns.map((column) => column.name),
          t('columnName'),
        ),
        type,
        ...(beforeId ? { beforeId } : {}),
      }),
    })
    const snap: ColumnSnap = {
      id: created.column.id,
      name: created.column.name,
      type: created.column.type,
      nextId: beforeId ?? null,
      description: '',
      config: {},
      hidden: false,
      width: created.column.width,
      frozen: false,
      options: [],
      cells: [],
    }
    pushCommand(tableId, { kind: 'columns-created', columns: [snap] })
    await refresh()
    if (type === 'relation') {
      setRelationTarget('')
      setPopover({ kind: 'relation', columnId: created.column.id, ...point })
      return
    }
    setRenamingColumn(created.column.id)
  }

  async function insertRow(beforeId?: string) {
    const created = await api.request<{ row: { id: string; version: number } }>(
      `/tables/${tableId}/rows`,
      {
        method: 'POST',
        body: JSON.stringify({ cells: {}, ...(beforeId ? { beforeId } : {}) }),
      },
    )
    const snap: RowSnap = {
      id: created.row.id,
      nextId: beforeId ?? null,
      cells: {},
      color: null,
      backgrounds: {},
    }
    pushCommand(tableId, { kind: 'rows-created', rows: [snap] })
    const first = visible.find(writable)
    if (first) setEditing(`${created.row.id}:${first.id}`)
    await refresh()
  }

  function clearInvalid(key: string) {
    setInvalidCells((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function scheduleCell(row: RowRecord, column: Column, nextValue: unknown, delay = 300) {
    const columnId = column.id
    const key = `cell:${row.id}:${columnId}`
    const next = nextValue === '' ? null : nextValue
    const formatKey = cellFormatError(column, next)
    if (formatKey) {
      sync.discard(key)
      setInvalidCells((current) => ({
        ...current,
        [key]: { text: next == null ? '' : String(next), message: t(formatKey) },
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
        if (draft === previous)
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
        }
        setNotice('')
      },
      rollback: () => {
        const message = serverReject.current.get(key)
        serverReject.current.delete(key)
        cellBaseline.current.delete(key)
        if (message) {
          setInvalidCells((current) => ({
            ...current,
            [key]: { text: next == null ? '' : String(next), message },
          }))
          return
        }
        mapCachedRows(queryClient, tableId, (item) =>
          item.id === row.id ? { ...item, cells: { ...item.cells, [columnId]: previous } } : item,
        )
        showEditError(t('error'))
      },
    })
  }

  function scheduleColumnName(column: Column, next: string) {
    const before = column.name
    sync.edit(`column:${column.id}:name`, {
      draft: next,
      delay: 300,
      apply: () => undefined,
      commit: async (draft) => {
        const trimmed = draft.trim()
        if (!trimmed || trimmed === before) return { name: before }
        await api.request(`/columns/${column.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: trimmed }),
        })
        return { name: trimmed }
      },
      accept: (record) => {
        patchCachedTable(queryClient, tableId, (current) => ({
          ...current,
          columns: current.columns?.map((item) =>
            item.id === column.id ? { ...item, name: record.name } : item,
          ),
        }))
        if (record.name !== before)
          pushCommand(tableId, {
            kind: 'column-renamed',
            columnId: column.id,
            before,
            after: record.name,
          })
        setNotice('')
      },
      rollback: () => {
        patchCachedTable(queryClient, tableId, (current) => ({
          ...current,
          columns: current.columns?.map((item) =>
            item.id === column.id ? { ...item, name: before } : item,
          ),
        }))
        showEditError(t('error'))
      },
    })
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

  async function paintRow(row: RowRecord, color: string | null) {
    const result = await api.request<{ row: RowRecord }>(`/rows/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ version: row.version, cells: {}, color }),
    })
    pushCommand(tableId, {
      kind: 'patch',
      undo: [{ rowId: row.id, version: result.row.version, cells: {}, color: row.color }],
      redo: [{ rowId: row.id, version: result.row.version, cells: {}, color }],
    })
    mapCachedRows(queryClient, tableId, (item) =>
      item.id === row.id ? { ...item, ...result.row } : item,
    )
    setPopover(null)
  }

  async function paintCell(row: RowRecord, columnId: string, color: string | null) {
    const previous = row.backgrounds?.[columnId] ?? null
    const result = await api.request<{ row: RowRecord }>(`/rows/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ version: row.version, cells: {}, backgrounds: { [columnId]: color } }),
    })
    pushCommand(tableId, {
      kind: 'patch',
      undo: [
        {
          rowId: row.id,
          version: result.row.version,
          cells: {},
          backgrounds: { [columnId]: previous },
        },
      ],
      redo: [
        {
          rowId: row.id,
          version: result.row.version,
          cells: {},
          backgrounds: { [columnId]: color },
        },
      ],
    })
    mapCachedRows(queryClient, tableId, (item) =>
      item.id === row.id ? { ...item, ...result.row } : item,
    )
    setPopover(null)
  }

  async function paintRows(color: string | null) {
    const targets = rows.filter((row) => checked.includes(row.id))
    const undo = []
    const redo = []
    for (const row of targets) {
      const result = await api.request<{ row: RowRecord }>(`/rows/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ version: row.version, cells: {}, color }),
      })
      undo.push({ rowId: row.id, version: result.row.version, cells: {}, color: row.color })
      redo.push({ rowId: row.id, version: result.row.version, cells: {}, color })
    }
    if (undo.length > 0) pushCommand(tableId, { kind: 'patch', undo, redo })
    setPopover(null)
    for (const row of targets) {
      const saved = redo.find((item) => item.rowId === row.id)
      if (!saved) continue
      mapCachedRows(queryClient, tableId, (item) =>
        item.id === row.id ? { ...item, version: saved.version, color } : item,
      )
    }
  }

  async function saveColumnRules(columnId: string, drafts: { id: string; expression: string; color: string | null; background: string | null }[]) {
    const before = rules
    const next = drafts.map((draft) => ({
      id: draft.id,
      scope: 'cell' as const,
      columnId,
      expression: draft.expression,
      style: {
        ...(draft.color ? { color: draft.color } : {}),
        ...(draft.background ? { background: draft.background } : {}),
      },
    }))
    const after = [...rules.filter((rule) => rule.columnId !== columnId), ...next]
    const saved = await api.request<{ table: TableRecord }>(`/tables/${tableId}`, {
      method: 'PATCH',
      body: JSON.stringify({ formatRules: after }),
    })
    patchCachedTable(queryClient, tableId, (current) => ({ ...current, formatRules: saved.table.formatRules }))
    pushCommand(tableId, { kind: 'rules', before, after: saved.table.formatRules })
    setFormatTarget(null)
  }

  async function saveCellRules(row: RowRecord, columnId: string, drafts: { id: string; expression: string; color: string | null; background: string | null }[]) {
    const previous = row.formats?.[columnId] ?? []
    const next = drafts.map((draft) => ({
      id: draft.id,
      scope: 'cell' as const,
      columnId,
      expression: draft.expression,
      style: {
        ...(draft.color ? { color: draft.color } : {}),
        ...(draft.background ? { background: draft.background } : {}),
      },
    }))
    const result = await api.request<{ row: RowRecord }>(`/rows/${row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ version: row.version, cells: {}, formats: { [columnId]: next } }),
    })
    pushCommand(tableId, {
      kind: 'patch',
      undo: [{ rowId: row.id, version: result.row.version, cells: {}, formats: { [columnId]: previous } }],
      redo: [{ rowId: row.id, version: result.row.version, cells: {}, formats: { [columnId]: result.row.formats?.[columnId] ?? next } }],
    })
    mapCachedRows(queryClient, tableId, (item) => (item.id === row.id ? { ...item, ...result.row } : item))
    setFormatTarget(null)
  }

  async function applyType(column: Column, type: string, after?: () => Promise<void>) {
    const preview = await api.request<{ cleared: number }>(`/columns/${column.id}/convert`, {
      method: 'POST',
      body: JSON.stringify({ type, dryRun: true }),
    })
    const run = async () => {
      const current = await fetchRows()
      const cells = current.map((row) => ({ rowId: row.id, value: row.cells[column.id] ?? null }))
      await api.request(`/columns/${column.id}/convert`, {
        method: 'POST',
        body: JSON.stringify({ type }),
      })
      if (after) await after()
      pushCommand(tableId, {
        kind: 'column-type',
        columnId: column.id,
        beforeType: column.type,
        afterType: type,
        cells,
      })
      await refresh()
    }
    if (preview.cleared > 0) {
      setConfirm({
        title: t('typeChangeTitle'),
        body: t('typeChangeWarning', { count: preview.cleared }),
        run,
      })
      return
    }
    await run()
  }

  async function saveRelation(column: Column, toTableId = relationTarget) {
    if (!toTableId) return
    const current = await fetchRows()
    const cells = current.map((row) => ({ rowId: row.id, value: row.cells[column.id] ?? null }))
    const preview = await api.request<{ cleared: number }>(`/columns/${column.id}/convert`, {
      method: 'POST',
      body: JSON.stringify({ type: 'relation', dryRun: true }),
    })
    const run = async () => {
      await api.request(`/columns/${column.id}/relation`, {
        method: 'POST',
        body: JSON.stringify({ toTableId, cardinality: relationCardinality }),
      })
      pushCommand(tableId, {
        kind: 'column-type',
        columnId: column.id,
        beforeType: column.type,
        afterType: 'relation',
        cells,
      })
      setPopover(null)
      await refresh()
    }
    if (preview.cleared > 0) {
      setPopover(null)
      setConfirm({
        title: t('typeChangeTitle'),
        body: t('typeChangeWarning', { count: preview.cleared }),
        run,
      })
      return
    }
    await run()
  }

  function rowSnap(row: RowRecord, nextId: string | null): RowSnap {
    return {
      id: row.id,
      nextId,
      cells: row.cells,
      color: row.color,
      backgrounds: row.backgrounds ?? {},
      notes: row.notes ?? '',
    }
  }

  function nextKept(id: string, removed: Set<string>) {
    const index = rows.findIndex((row) => row.id === id)
    for (let cursor = index + 1; cursor < rows.length; cursor += 1) {
      if (!removed.has(rows[cursor].id)) return rows[cursor].id
    }
    return null
  }

  async function deleteRows(ids: string[]) {
    if (ids.length === 0) return
    const removed = new Set(ids)
    const snaps = rows
      .filter((row) => removed.has(row.id))
      .map((row) => rowSnap(row, nextKept(row.id, removed)))
    await api.request(`/tables/${tableId}/rows/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify({ rowIds: ids }),
    })
    pushCommand(tableId, { kind: 'rows-deleted', rows: snaps })
    setChecked([])
    await refresh()
  }

  async function duplicateSelectedRows(ids = checked) {
    const ordered = rows.filter((row) => ids.includes(row.id))
    if (ordered.length === 0) return
    const result = await api.request<{ rowIds: string[] }>(`/tables/${tableId}/rows/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ rowIds: ordered.map((row) => row.id) }),
    })
    pushCommand(tableId, {
      kind: 'rows-created',
      rows: result.rowIds.map((id, index) => rowSnap({ ...ordered[index], id }, null)),
    })
    setChecked([])
    await refresh()
  }

  async function deleteColumns(ids: string[]) {
    if (ids.length === 0) return
    const loaded = await loadEveryRow()
    const removed = new Set(ids)
    const snaps: ColumnSnap[] = columns
      .filter((column) => removed.has(column.id))
      .map((column) => {
        const index = columns.findIndex((item) => item.id === column.id)
        let nextId: string | null = null
        for (let cursor = index + 1; cursor < columns.length; cursor += 1) {
          if (!removed.has(columns[cursor].id)) {
            nextId = columns[cursor].id
            break
          }
        }
        return {
          id: column.id,
          name: column.name,
          type: column.type,
          nextId,
          description: column.description,
          config: column.config,
          hidden: column.hidden,
          width: column.width,
          frozen: column.frozen,
          options: column.options.map((option) => ({ label: option.label, color: option.color })),
          cells: loaded.map((row) => ({
            rowId: row.id,
            value: row.cells[column.id] ?? null,
            background: row.backgrounds?.[column.id] ?? null,
          })),
        }
      })
    for (const columnId of ids) await api.request(`/columns/${columnId}`, { method: 'DELETE' })
    pushCommand(tableId, { kind: 'columns-deleted', columns: snaps })
    setSelectedColumns([])
    await refresh()
  }

  async function duplicateSelectedColumns(ids = selectedColumns) {
    const selected = columns.filter((column) => ids.includes(column.id))
    if (selected.length === 0) return
    const result = await api.request<{ columns: Column[] }>(
      `/tables/${tableId}/columns/duplicate`,
      {
        method: 'POST',
        body: JSON.stringify({ columnIds: selected.map((column) => column.id) }),
      },
    )
    const snaps: ColumnSnap[] = result.columns.map((column, index) => {
      const source = selected[index]
      const sourceIndex = columns.findIndex((item) => item.id === source.id)
      return {
        id: column.id,
        name: column.name,
        type: column.type,
        nextId: columns[sourceIndex + 1]?.id ?? null,
        description: column.description,
        config: column.config,
        hidden: column.hidden,
        width: column.width,
        frozen: column.frozen,
        options: column.options.map((option) => ({ label: option.label, color: option.color })),
        cells: rows.map((row) => ({
          rowId: row.id,
          value: row.cells[source.id] ?? null,
          background: row.backgrounds?.[source.id] ?? null,
        })),
      }
    })
    pushCommand(tableId, { kind: 'columns-created', columns: snaps })
    setSelectedColumns([])
    await refresh()
  }

  async function reorderColumns(nextIds: string[]) {
    const before = columns.map((column) => column.id)
    if (before.join() === nextIds.join()) return
    try {
      await api.request(`/tables/${tableId}/columns/order`, {
        method: 'PUT',
        body: JSON.stringify({ columnIds: nextIds }),
      })
      pushCommand(tableId, { kind: 'column-order', before, after: nextIds })
      await refresh()
    } catch {
      showEditError(t('error'))
    }
  }

  async function reorderRow(rowId: string, beforeId: string) {
    const index = rows.findIndex((row) => row.id === rowId)
    const beforeNextId = rows[index + 1]?.id ?? null
    try {
      await api.request(`/tables/${tableId}/rows/move`, {
        method: 'POST',
        body: JSON.stringify({ rowId, beforeId }),
      })
      pushCommand(tableId, { kind: 'row-moved', rowId, beforeNextId, afterNextId: beforeId })
      await refresh()
    } catch {
      showEditError(t('error'))
    }
  }

  async function hideColumn(column: Column, hidden: boolean) {
    await api.request(`/columns/${column.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ hidden }),
    })
    pushCommand(tableId, {
      kind: 'column-hidden',
      columnId: column.id,
      before: column.hidden,
      after: hidden,
    })
    await refresh()
  }

  async function fillDown(columnId: string) {
    const ordered = rows.filter((row) => checked.includes(row.id))
    if (ordered.length < 2) return
    const source = ordered[0].cells[columnId] ?? null
    const previous = ordered
      .slice(1)
      .map((row) => ({ rowId: row.id, value: row.cells[columnId] ?? null }))
    await api.request(`/tables/${tableId}/fill`, {
      method: 'POST',
      body: JSON.stringify({ columnId, rowIds: ordered.map((row) => row.id) }),
    })
    const fresh = await fetchRows()
    pushCommand(tableId, {
      kind: 'patch',
      undo: previous.map((item) => ({
        rowId: item.rowId,
        version: fresh.find((row) => row.id === item.rowId)?.version ?? 1,
        cells: { [columnId]: item.value },
      })),
      redo: previous.map((item) => ({
        rowId: item.rowId,
        version: fresh.find((row) => row.id === item.rowId)?.version ?? 1,
        cells: { [columnId]: source },
      })),
    })
    setChecked([])
    await refresh()
  }

  async function pasteTsv(text: string) {
    const grid = text
      .replace(/\r/g, '')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => line.split('\t'))
    const targets = visible.slice(selected.column).filter(writable)
    const updates: { rowId: string; version: number; cells: Record<string, unknown> }[] = []
    const previous: { rowId: string; version: number; cells: Record<string, unknown> }[] = []
    for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
      const row = rows[selected.row + rowIndex]
      if (!row) break
      const cells: Record<string, unknown> = {}
      const before: Record<string, unknown> = {}
      grid[rowIndex].forEach((value, columnIndex) => {
        const column = targets[columnIndex]
        if (!column) return
        cells[column.id] = value
        before[column.id] = row.cells[column.id] ?? null
      })
      if (Object.keys(cells).length > 0) {
        updates.push({ rowId: row.id, version: row.version, cells })
        previous.push({ rowId: row.id, version: row.version, cells: before })
      }
    }
    if (updates.length === 0) return
    await api.request(`/tables/${tableId}/cells/bulk`, {
      method: 'PATCH',
      body: JSON.stringify({ updates }),
    })
    const fresh = await fetchRows()
    const stamp = (items: { rowId: string; version: number; cells: Record<string, unknown> }[]) =>
      items.map((item) => ({
        ...item,
        version: fresh.find((row) => row.id === item.rowId)?.version ?? item.version,
      }))
    pushCommand(tableId, { kind: 'patch', undo: stamp(previous), redo: stamp(updates) })
    await refresh()
  }

  copyCellRef.current = () => {
    const column = visible[selected.column]
    const row = rows[selected.row]
    if (!column || !row) return
    void navigator.clipboard.writeText(showCell(row.cells[column.id]))
  }
  clearCellRef.current = () => {
    const column = visible[selected.column]
    const row = rows[selected.row]
    if (!column || !row || !writable(column)) return
    scheduleCell(row, column, '', 0)
    void sync.flush(`cell:${row.id}:${column.id}`)
  }
  pasteCellRef.current = (text: string) => {
    void pasteTsv(text)
  }

  async function commitFormulaFill(column: Column, sourceRowId: string, rowIds: string[]) {
    const result = await api.request<{ expression: string; previous: { rowId: string; source: string }[] }>(
      `/tables/${tableId}/formulas/fill`,
      {
        method: 'POST',
        body: JSON.stringify({ columnId: column.id, sourceRowId, rowIds }),
      },
    )
    if (result.previous.length === 0) return
    pushCommand(tableId, {
      kind: 'formulas',
      columnId: column.id,
      undo: result.previous.map((item) => ({ rowId: item.rowId, expression: item.source })),
      redo: result.previous.map((item) => ({ rowId: item.rowId, expression: result.expression })),
    })
    await refresh()
  }

  async function commitFill(column: Column, from: number, to: number) {
    const ids = fillTargets(rows, from, to, fillable(column))
    if (ids.length === 0) return
    const source = rows[from]
    if (!source) return
    if (column.type === 'formula') {
      try {
        await commitFormulaFill(column, source.id, ids)
      } catch (error) {
        const message = editFailureMessage(error, t('error'))
        if (message) showEditError(message)
      }
      return
    }
    const value = source.cells[column.id] ?? null
    const updates = ids.map((rowId) => {
      const row = rows.find((item) => item.id === rowId)
      return { rowId, version: row?.version ?? 1, cells: { [column.id]: value } }
    })
    const previous = ids.map((rowId) => {
      const row = rows.find((item) => item.id === rowId)
      return { rowId, version: row?.version ?? 1, cells: { [column.id]: row?.cells[column.id] ?? null } }
    })
    try {
      await api.request(`/tables/${tableId}/cells/bulk`, {
        method: 'PATCH',
        body: JSON.stringify({ updates }),
      })
      const fresh = await fetchRows()
      const stamp = (items: { rowId: string; version: number; cells: Record<string, unknown> }[]) =>
        items.map((item) => ({
          ...item,
          version: fresh.find((row) => row.id === item.rowId)?.version ?? item.version,
        }))
      pushCommand(tableId, { kind: 'patch', undo: stamp(previous), redo: stamp(updates) })
      await refresh()
    } catch (error) {
      const message = editFailureMessage(error, t('error'))
      if (message) showEditError(message)
    }
  }

  function rowIndexAt(clientY: number) {
    const parent = parentRef.current
    if (!parent || rows.length === 0) return 0
    const header = parent.querySelector('thead')
    const headerHeight = header?.getBoundingClientRect().height ?? 40
    const top = parent.getBoundingClientRect().top
    const y = parent.scrollTop + (clientY - top) - headerHeight
    return Math.min(rows.length - 1, Math.max(0, Math.floor(y / 36)))
  }

  function beginFill(event: ReactPointerEvent, rowIndex: number, column: Column) {
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget instanceof HTMLElement) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // A pointer that is already released still tracks through the window listeners below.
      }
    }
    let lastY = event.clientY
    setFill({ columnId: column.id, from: rowIndex, to: rowIndex })
    const previousSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    function tick() {
      const parent = parentRef.current
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      if (lastY < rect.top + 36) parent.scrollTop -= 18
      else if (lastY > rect.bottom - 36) parent.scrollTop += 18
      setFill({ columnId: column.id, from: rowIndex, to: rowIndexAt(lastY) })
    }
    const frame = window.setInterval(tick, 40)
    function move(next: PointerEvent) {
      lastY = next.clientY
      setFill({ columnId: column.id, from: rowIndex, to: rowIndexAt(next.clientY) })
    }
    function up(next: PointerEvent) {
      window.clearInterval(frame)
      document.body.style.userSelect = previousSelect
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setFill(null)
      void commitFill(column, rowIndex, rowIndexAt(next.clientY))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  beginFillRef.current = beginFill

  async function saveConfig(column: Column, patch: Record<string, unknown>) {
    const config = { ...column.config, ...patch }
    patchCachedTable(queryClient, tableId, (current) => ({
      ...current,
      columns: current.columns?.map((item) => (item.id === column.id ? { ...item, config } : item)),
    }))
    try {
      await api.request(`/columns/${column.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ config }),
      })
      setNotice('')
    } catch {
      showEditError(t('error'))
      await refresh()
    }
  }

  async function setFooter(enabled: boolean) {
    const next = { ...footerConfig, enabled }
    patchCachedTable(queryClient, tableId, (current) => ({ ...current, footerConfig: next }))
    await api.request(`/tables/${tableId}`, {
      method: 'PATCH',
      body: JSON.stringify({ footerConfig: next }),
    })
    await queryClient.invalidateQueries({ queryKey: ['footer', tableId] })
  }

  async function setFooterCalc(columnId: string, calc: string) {
    const columns = { ...(footerConfig.columns ?? {}) }
    if (columns[columnId] === calc) delete columns[columnId]
    else columns[columnId] = calc
    const next = { ...footerConfig, enabled: true, columns }
    patchCachedTable(queryClient, tableId, (current) => ({ ...current, footerConfig: next }))
    await api.request(`/tables/${tableId}`, {
      method: 'PATCH',
      body: JSON.stringify({ footerConfig: next }),
    })
    await queryClient.invalidateQueries({ queryKey: ['footer', tableId] })
  }

  function openColumnMenu(event: ReactMouseEvent, column: Column) {
    event.stopPropagation()
    const point = anchor(event)
    openMenu(
      event,
      buildColumnHeaderMenu({
        column,
        checkedCount: checked.length,
        label: (key) => t(key),
        onSelect: (id) => {
          if (id === 'rename') {
            setRenamingColumn(column.id)
            return
          }
          if (id.startsWith('type-')) {
            const type = id.slice('type-'.length)
            if (type === 'relation') {
              setRelationTarget('')
              setPopover({ kind: 'relation', columnId: column.id, ...point })
              return
            }
            void applyType(column, type)
            return
          }
          if (id === 'sort') {
            cycleSort(column.id)
            return
          }
          if (id === 'filter') {
            setPopover({ kind: 'filter', columnId: column.id, ...point })
            return
          }
          if (id === 'left') {
            openNewColumn(column.id, point)
            return
          }
          if (id === 'right') {
            openNewColumn(columns[columns.findIndex((item) => item.id === column.id) + 1]?.id, point)
            return
          }
          if (id === 'duplicate') {
            void duplicateSelectedColumns([column.id])
            return
          }
          if (id === 'fill') {
            void fillDown(column.id)
            return
          }
          if (id === 'conditional') {
            setFormatTarget({ columnId: column.id })
            return
          }
          if (id.startsWith('variant-')) {
            void saveConfig(column, { variant: id.slice('variant-'.length) })
            return
          }
          if (id.startsWith('currency-')) {
            void saveConfig(column, { currency: id.slice('currency-'.length) })
            return
          }
          if (id.startsWith('style-')) {
            void saveConfig(column, { style: id.slice('style-'.length) })
            return
          }
          if (id.startsWith('footer-')) {
            void setFooterCalc(column.id, id.slice('footer-'.length))
            return
          }
          if (id === 'hide') {
            void hideColumn(column, true)
            return
          }
          if (id === 'delete') void deleteColumns([column.id])
        },
      }),
    )
  }

  function openRowMenu(event: ReactMouseEvent, row: RowRecord) {
    event.stopPropagation()
    const point = anchor(event)
    const list = rowsRef.current
    const index = list.findIndex((item) => item.id === row.id)
    openMenu(event, [
      { id: 'notes', label: t('notes'), icon: StickyNote, onSelect: () => setDrawerRowId(row.id) },
      { id: 'above', label: t('insertAbove'), icon: ArrowUpToLine, onSelect: () => void insertRow(row.id) },
      { id: 'below', label: t('insertBelow'), icon: ArrowDownToLine, onSelect: () => void insertRow(list[index + 1]?.id) },
      {
        id: 'duplicate',
        label: t('duplicate'),
        icon: Copy,
        onSelect: () => void duplicateSelectedRows([row.id]),
      },
      {
        id: 'color',
        label: t('rowColor'),
        icon: Palette,
        onSelect: () => setPopover({ kind: 'row-color', rowId: row.id, ...point }),
      },
      {
        id: 'select',
        label: t('selectRow'),
        icon: ListChecks,
        onSelect: () =>
          setChecked((current) => (current.includes(row.id) ? current : [...current, row.id])),
      },
      { id: 'delete', label: t('delete'), icon: Trash2, danger: true, onSelect: () => void deleteRows([row.id]) },
    ])
  }

  function openCellMenu(event: ReactMouseEvent, row: RowRecord, column: Column) {
    event.stopPropagation()
    const point = anchor(event)
    openMenu(event, [
      {
        id: 'edit',
        label: t('edit'),
        icon: Pencil,
        disabled: !writable(column) && column.type !== 'formula',
        onSelect: () => activateCell(row, column),
      },
      {
        id: 'copy',
        label: t('copy'),
        icon: Copy,
        onSelect: () => void navigator.clipboard.writeText(showCell(row.cells[column.id])),
      },
      {
        id: 'paste',
        label: t('paste'),
        icon: ClipboardPaste,
        onSelect: () => void navigator.clipboard.readText().then((text) => pasteTsv(text)),
      },
      {
        id: 'clear',
        label: t('clearCell'),
        icon: Eraser,
        disabled: !writable(column),
        onSelect: () => {
          scheduleCell(row, column, '', 0)
          void sync.flush(`cell:${row.id}:${column.id}`)
        },
      },
      {
        id: 'color',
        label: t('cellColor'),
        icon: Palette,
        onSelect: () =>
          setPopover({ kind: 'cell-color', rowId: row.id, columnId: column.id, ...point }),
      },
      {
        id: 'conditional',
        label: t('conditionalColor'),
        icon: Palette,
        onSelect: () => setFormatTarget({ columnId: column.id, rowId: row.id }),
      },
    ])
  }

  const flags = historyFlags(tableId)
  void historyTick

  function openTitleMenu(event: ReactMouseEvent) {
    const point = anchor(event)
    const hidden = columns.filter((column) => column.hidden)
    openMenu(event, [
      { id: 'undo', label: t('undo'), icon: Undo2, disabled: !flags.canUndo, onSelect: () => void undo('undo') },
      { id: 'redo', label: t('redo'), icon: Redo2, disabled: !flags.canRedo, onSelect: () => void undo('redo') },
      {
        id: 'find',
        label: t('find'),
        icon: Search,
        onSelect: () => setPopover({ kind: 'find', ...point }),
      },
      {
        id: 'favorite',
        label: t('addToFavorites'),
        icon: Star,
        onSelect: () =>
          void api.request('/favorites', {
            method: 'POST',
            body: JSON.stringify({ resourceType: 'table', resourceId: tableId }),
          }),
      },
      { id: 'export', label: t('export'), icon: Download, onSelect: () => void exportCsv() },
      { id: 'footer', label: t('footer'), icon: Sigma, onSelect: () => void setFooter(!footerConfig.enabled) },
      { id: 'import', label: t('import'), icon: Upload, onSelect: () => importRef.current?.click() },
      ...(views.data?.views ?? []).map((view) => ({
        id: view.id,
        label: view.name,
        icon: Bookmark,
        onSelect: () => applyView(view),
      })),
      {
        id: 'save-view',
        label: t('saveView'),
        icon: Save,
        onSelect: () => setPopover({ kind: 'view', ...point }),
      },
      ...hidden.map((column) => ({
        id: `show-${column.id}`,
        label: `${t('showColumn')}: ${column.name}`,
        icon: Eye,
        onSelect: () => void hideColumn(column, false),
      })),
      {
        id: 'duplicate',
        label: t('duplicateTable'),
        icon: Copy,
        onSelect: () => void duplicateThisTable(),
      },
      {
        id: 'delete',
        label: t('delete'),
        icon: Trash2,
        danger: true,
        onSelect: () =>
          setConfirm({
            title: t('deleteTableTitle'),
            body: t('deleteTableWarning', { name: table?.name ?? '' }),
            run: deleteThisTable,
          }),
      },
    ])
  }
  titleMenuRef.current = openTitleMenu

  function applyView(view: SavedView) {
    const definition = view.definition ?? {}
    const sortValue = definition.sort
    if (!sortValue) setSort(null)
    else if (typeof sortValue === 'string')
      setSort({ columnId: sortValue, direction: definition.direction === 'desc' ? 'desc' : 'asc' })
    else
      setSort({
        columnId: sortValue.columnId,
        direction: sortValue.direction === 'desc' ? 'desc' : 'asc',
      })
    const next = filtersFrom(definition.filter)
    setFilters(next)
    setFilterInput(next)
  }

  async function exportCsv() {
    const result = await api.request<{ csv: string }>(`/tables/${tableId}/export`, {
      method: 'POST',
      body: JSON.stringify({ filter }),
    })
    const url = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${table?.name ?? 'export'}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  async function deleteThisTable() {
    await api.request(`/tables/${tableId}`, { method: 'DELETE' })
    window.location.assign(`/projects/${projectId}`)
  }

  async function duplicateThisTable() {
    if (!projectId) return
    try {
      const result = await api.request<{ table: TableRecord }>(`/tables/${tableId}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ includeData: true }),
      })
      await queryClient.invalidateQueries({ queryKey: ['tables', projectId] })
      navigate(`/projects/${projectId}/tables/${result.table.id}`)
    } catch (caught) {
      showEditError(caught instanceof Error ? caught.message : t('error'))
    }
  }

  async function saveView() {
    if (!viewName.trim()) return
    await api.request(`/tables/${tableId}/views`, {
      method: 'POST',
      body: JSON.stringify({
        name: viewName.trim(),
        shared: sharedView,
        definition: { filter, sort, formatting: rules },
      }),
    })
    setViewName('')
    setPopover(null)
    await queryClient.invalidateQueries({ queryKey: ['views', tableId] })
  }

  const toolbarActions = useMemo(() => {
    if (!table) return null
    return {
      find: (el: HTMLElement) => setPopover({ kind: 'find', ...viewportAnchorFrom(el) }),
      exportCsv: () => void exportCsv(),
      importCsv: () => importRef.current?.click(),
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
    }
  }, [table, tableId, t, views.data?.views])

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
    () => [
      {
        id: 'select',
        header: () => (
          <div className="flex h-10 items-center gap-1 px-1">
            <span className="inline-flex size-3.5 shrink-0" aria-hidden="true" />
            <Checkbox
              aria-label={selectingAll ? t('selectingAll') : t('selectAll')}
              disabled={selectingAll}
              checked={allChecked ? true : checked.length > 0 ? 'indeterminate' : false}
              onCheckedChange={() => {
                if (allChecked) {
                  setChecked([])
                  return
                }
                setSelectingAll(true)
                void loadEveryRow()
                  .then((loaded) => setChecked(loaded.map((row) => row.id)))
                  .finally(() => setSelectingAll(false))
              }}
            />
          </div>
        ),
        size: GUTTER_WIDTH,
        cell: ({ row }) => (
            <div
            className="flex h-9 items-center gap-1 px-1"
            onContextMenu={(event) => openRowMenu(event, row.original)}
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse') return
              const point = { x: event.clientX, y: event.clientY }
              pressOrigin.current = point
              const rowRecord = row.original
              window.clearTimeout(pressTimer.current)
              pressTimer.current = window.setTimeout(() => {
                openRowMenu({ preventDefault() {}, clientX: point.x, clientY: point.y } as ReactMouseEvent, rowRecord)
              }, 500)
            }}
            onPointerMove={(event) => {
              if (Math.hypot(event.clientX - pressOrigin.current.x, event.clientY - pressOrigin.current.y) > 10) {
                window.clearTimeout(pressTimer.current)
              }
            }}
            onPointerUp={() => window.clearTimeout(pressTimer.current)}
            onPointerCancel={() => window.clearTimeout(pressTimer.current)}
          >
            <span
              role="button"
              tabIndex={-1}
              draggable
              aria-label={t('reorder')}
              className="inline-flex shrink-0 cursor-grab text-muted-foreground"
              onMouseDown={(event) => event.stopPropagation()}
              onDragStart={(event) => {
                event.stopPropagation()
                dragItem.current = { kind: 'row', id: row.original.id }
                event.dataTransfer.setData('text/plain', `row:${row.original.id}`)
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={() => {
                dragItem.current = null
                setDropTarget(null)
              }}
            >
              <GripVertical className="size-3.5" />
            </span>
            <Checkbox
              aria-label={t('selectRowNumber', { number: row.original.rowNumber })}
              checked={checked.includes(row.original.id)}
              onCheckedChange={(next) => {
                setChecked((current) =>
                  next === true
                    ? [...current, row.original.id]
                    : current.filter((id) => id !== row.original.id),
                )
              }}
            />
            <button
              type="button"
              aria-label={t('insertRow')}
              className="hidden text-muted-foreground md:inline-flex md:opacity-0 md:group-hover:opacity-100"
              onClick={() => void insertRow(rowsRef.current[row.index + 1]?.id)}
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        ),
      },
      ...columns.map((column) => ({
        id: column.id,
        header: column.name,
        size: column.width,
        cell: ({ row }: { row: { original: RowRecord; index: number } }) => {
          if (column.hidden) return <div className="h-9" />
          const value = row.original.cells[column.id]
          const presented = presentFormatRow(columns, row.original.cells, {
            tags: (table?.tags ?? []).map((tag) => ({ id: tag.id, name: tag.name })),
            statuses: (table?.statuses ?? []).map((status) => ({ id: status.id, name: status.name })),
            members: (membersQuery.data?.members ?? []).map((member) => ({ id: member.userId, name: member.username })),
          })
          const ruleStyle = conditionalStyle(
            rules,
            row.original.formats?.[column.id],
            row.original.cells,
            column.id,
            (expression) => matchesCondition(expression, presented[column.id] ?? null, presented),
          )
          const cellPaint = row.original.backgrounds?.[column.id] || ruleStyle.background
          const rowColor = row.original.color
          const painted = paintSwatch(cellPaint, 'background') ?? rowTint(rowColor, paintSwatch(rowColor, 'background'))
          const stripe = !cellPaint && rowColor ? paintSwatch(rowColor, 'background') : undefined
          const active = editing === `${row.original.id}:${column.id}`
          const invalid = invalidCells[`cell:${row.original.id}:${column.id}`]
          const text = invalid?.text ?? showCell(value)
          const mono =
            column.type === 'number' ||
            column.type === 'currency' ||
            column.type === 'formula' ||
            column.type === 'lookup'
          const lit =
            spotlight?.columnId === column.id &&
            (spotlight.rowId === row.original.id || !spotlight.rowId)
          const columnIndex = visible.findIndex((item) => item.id === column.id)
          const picked = selected.row === row.index && selected.column === columnIndex
          const inFill = Boolean(
            fill &&
              fill.columnId === column.id &&
              row.index >= Math.min(fill.from, fill.to) &&
              row.index <= Math.max(fill.from, fill.to),
          )
          return (
            <div
              className={`relative flex h-9 min-w-0 items-center overflow-hidden px-2 ${mono ? 'font-mono' : ''} ${picked || lit ? 'ring-2 ring-inset ring-primary' : ''} ${inFill && !picked ? 'bg-accent' : ''}`}
              style={{
                color: paintSwatch(ruleStyle.color, 'text'),
                background: inFill && !picked ? undefined : painted,
                boxShadow: stripe ? `inset 3px 0 0 ${stripe}` : undefined,
                fontWeight: ruleStyle.bold ? 700 : 400,
              }}
              onContextMenu={(event) => openCellMenu(event, row.original, column)}
              onClick={(event) => {
                focusCell(row.index, columnIndex)
                if (event.detail >= 2) activateCell(row.original, column)
              }}
            >
              {active && column.type === 'relation' ? (
                <SelectField
                  label={t('editColumn', { name: column.name })}
                  className="h-9 border-0 bg-transparent px-0"
                  value={typeof value === 'string' ? value : ''}
                  onValueChange={(next) => {
                    scheduleCell(row.original, column, next, 0)
                    void sync.flush(`cell:${row.original.id}:${column.id}`)
                    setEditing(null)
                  }}
                  options={[
                    { value: '', label: t('none') },
                    ...(targetRows.data?.rows ?? []).map((target) => ({
                      value: target.id,
                      label: showCell(
                        Object.values(target.cells).find((item) => typeof item === 'string' && item) ??
                          target.id.slice(0, 8),
                      ),
                    })),
                  ]}
                />
              ) : (
                <CellEditor
                  column={column}
                  row={row.original}
                  active={active && writable(column)}
                  text={text}
                  tableId={tableId}
                  tags={table?.tags ?? []}
                  statuses={table?.statuses ?? []}
                  members={membersQuery.data?.members ?? []}
                  hint={invalid?.message}
                  onEdit={(value, delay) => scheduleCell(row.original, column, value, delay)}
                  onFlush={() => {
                    void sync
                      .flush(`cell:${row.original.id}:${column.id}`)
                      .catch((error: unknown) => {
                        const message = editFailureMessage(error, t('error'), { cell: true })
                        if (message) showEditError(message)
                      })
                      .finally(() => setEditing(null))
                  }}
                  onCancel={() => {
                    sync.cancel(`cell:${row.original.id}:${column.id}`)
                    clearInvalid(`cell:${row.original.id}:${column.id}`)
                    setEditing(null)
                  }}
                  onOpen={() => focusCell(row.index, columnIndex)}
                  onActivate={() => activateCell(row.original, column)}
                  onCreated={(kind, item) =>
                    patchCachedTable(queryClient, tableId, (current) => ({
                      ...current,
                      tags:
                        kind === 'tag'
                          ? [...(current.tags ?? []).filter((tag) => tag.id !== item.id), item]
                          : current.tags,
                      statuses:
                        kind === 'status'
                          ? [
                              ...(current.statuses ?? []).filter((status) => status.id !== item.id),
                              item,
                            ]
                          : current.statuses,
                    }))
                  }
                />
              )}
              {picked && !active && fillable(column) ? (
                <button
                  type="button"
                  aria-label={t('fillHandle')}
                  className="absolute bottom-0.5 right-0.5 z-10 flex size-3.5 cursor-crosshair items-center justify-center border border-primary bg-card text-primary"
                  onPointerDown={(event) => beginFillRef.current(event, row.index, column)}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Plus className="size-2.5" />
                </button>
              ) : null}
            </div>
          )
        },
      })),
    ],
    [
      allChecked,
      catalogSignature,
      checked,
      columnSignature,
      editing,
      fill,
      invalidSignature,
      rulesSignature,
      selected,
      spotlight,
      t,
      targetSignature,
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
  }, [gridReady])
  useEffect(() => {
    const parent = parentRef.current
    if (!parent) return
    const measure = () => setViewportWidth(parent.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [gridReady])

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

  const popoverColumn = columns.find((column) => column.id === popover?.columnId)
  const popoverRow = rows.find((row) => row.id === popover?.rowId)
  const columnsWidth = columns.reduce((sum, column) => sum + (widths[column.id] ?? column.width), 0)
  const filler = Math.max(ADD_COLUMN_WIDTH, viewportWidth - GUTTER_WIDTH - columnsWidth)

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-0 pt-0 md:px-6" style={{ WebkitTouchCallout: 'none' }}>
      <p className={notice ? 'text-sm text-danger' : 'sr-only'}>{notice}</p>
      <input
        ref={importRef}
        aria-label={t('import')}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          const body = new FormData()
          body.append('file', file)
          void api
            .request<{ created: number; errors: { error?: string }[] }>(
              `/tables/${tableId}/import`,
              { method: 'POST', body },
            )
            .then(async (result) => {
              const summary = t('imported', { count: result.created })
              if (result.errors[0]?.error) {
                toast.warning(`${summary} ${result.errors[0].error}`)
                setNotice(`${summary} ${result.errors[0].error}`)
              } else {
                setNotice(summary)
              }
              await refresh()
            })
        }}
      />
      <div className="flex min-h-0 flex-1 flex-col border border-border bg-card">
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
            className="table-fixed border-collapse text-sm"
            style={{ width: GUTTER_WIDTH + columnsWidth + filler }}
          >
            <thead className="sticky top-0 z-20 bg-muted">
              <tr>
                <th
                  className="sticky left-0 z-30 h-10 border-b border-r border-border bg-muted p-0 text-left"
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
                        className="h-10 border-b border-r border-border p-0"
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
                      className={`group relative h-10 overflow-visible border-b border-r border-border px-2 text-left font-medium ${selectedColumns.includes(column.id) ? 'bg-accent' : ''} ${spotlight?.columnId === column.id && !spotlight.rowId ? 'ring-2 ring-inset ring-primary' : ''}`}
                      style={{ width: widths[column.id] ?? column.width }}
                      onDragOver={(event: DragEvent) => {
                        const from = dragItem.current
                        if (!from || from.kind !== 'column') return
                        event.preventDefault()
                        const next = beforeDropEdge(columns.map((item) => item.id), from.id, column.id) ? column.id : null
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
                          openColumnMenu({ preventDefault() {}, clientX: point.x, clientY: point.y } as ReactMouseEvent, column)
                        }, 500)
                      }}
                      onPointerMove={(event) => {
                        if (Math.hypot(event.clientX - pressOrigin.current.x, event.clientY - pressOrigin.current.y) > 10) {
                          window.clearTimeout(pressTimer.current)
                        }
                      }}
                      onPointerUp={() => window.clearTimeout(pressTimer.current)}
                      onPointerCancel={() => window.clearTimeout(pressTimer.current)}
                    >
                      {dropTarget?.kind === 'column' && dropTarget.id === column.id ? (
                        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-20 w-0.5 bg-primary" />
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
                            name={String(column.config.icon ?? defaultIcon(column.type))}
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
                            if (handle.hasPointerCapture(ev.pointerId)) handle.releasePointerCapture(ev.pointerId)
                            handle.removeEventListener('pointermove', move)
                            handle.removeEventListener('pointerup', up)
                          }
                          handle.addEventListener('pointermove', move)
                          handle.addEventListener('pointerup', up)
                        }}
                      />
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
                    </th>
                  )
                })}
                <th className="border-b border-border p-0 align-start" style={{ width: filler }}>
                  <button
                    type="button"
                    aria-label={t('insertColumn')}
                    className="inline-flex h-7 w-7 items-center justify-center hover:bg-accent"
                    onClick={(event) => openNewColumn(undefined, anchor(event))}
                  >
                    <Plus className="size-4" />
                  </button>
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
                      const next = beforeDropEdge(rows.map((item) => item.id), from.id, row.original.id) ? row.original.id : null
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
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={`relative overflow-hidden border-b border-r border-border p-0 ${cell.column.id === 'select' ? `sticky left-0 z-10 ${spotlight?.rowId === row.original.id && !spotlight.columnId ? 'bg-accent' : 'bg-card'}` : ''}`}
                      >
                        {dropTarget?.kind === 'column' && dropTarget.id === cell.column.id ? (
                          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-20 w-0.5 bg-primary" />
                        ) : null}
                        {dropTarget?.kind === 'row' && dropTarget.id === row.original.id ? (
                          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 bg-primary" />
                        ) : null}
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
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
                      return <td key={column.id} className="h-9 border-r border-t border-border" />
                    }
                    const calc = footerConfig.columns?.[column.id]
                    const stats = footerQuery.data?.footer?.[column.id]
                    return (
                      <td
                        key={column.id}
                        className="h-9 border-r border-t border-border px-2 text-xs text-muted-foreground"
                      >
                        {calc && stats
                          ? `${t(calc)} ${footerValue(calc, stats)}`
                          : calc && footerQuery.isLoading
                            ? t('footerLoading')
                            : ''}
                      </td>
                    )
                  })}
                  <td className="border-t border-border" />
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-t border-border bg-card px-2">
          <button
            type="button"
            className="flex h-9 shrink-0 items-center gap-1 whitespace-nowrap text-muted-foreground hover:text-foreground"
            onClick={() => void insertRow()}
          >
            <Plus className="size-3.5" />
            {t('insertRow')}
          </button>
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
                  ? t('selectedRowsAndColumns', { rows: checked.length, columns: selectedColumns.length })
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
      </div>
      {popover ? (
        <AnchoredLayer
          popover
          prefer="below"
          align="start"
          anchor={popover}
          className="w-[min(20rem,calc(100vw-2rem))] border border-border bg-card p-3 shadow-md"
        >
          {popover.kind === 'find' ? (
            <Input
              aria-label={t('find')}
              value={searchInput}
              onChange={(event) => {
                const value = event.target.value
                setSearchInput(value)
                sync.watch(`find:${tableId}`, 300, () => setSearch(value))
              }}
            />
          ) : null}
          {popover.kind === 'new-column' ? (
            <div className="flex flex-col gap-2">
              <SelectField
                label={t('columnType')}
                value={newColumnType}
                onValueChange={setNewColumnType}
                options={COLUMN_TYPES.map((type) => ({ value: type, label: t(`type_${type}`) }))}
              />
              <Button type="button" onClick={() => void createColumn(newColumnType)}>
                {t('confirm')}
              </Button>
            </div>
          ) : null}
          {popover.kind === 'filter' && popoverColumn ? (
            <div className="flex flex-col gap-2">
              <SelectField
                label={t('operator')}
                value={filterInput[popoverColumn.id]?.op ?? operatorsFor(popoverColumn.type)[0]}
                onValueChange={(op) => {
                  const next = {
                    ...filterInput,
                    [popoverColumn.id]: {
                      op,
                      value: filterInput[popoverColumn.id]?.value ?? '',
                    },
                  }
                  setFilterInput(next)
                  sync.watch(`filter:${tableId}`, 300, () => setFilters(next))
                }}
                options={operatorsFor(popoverColumn.type).map((op) => ({
                  value: op,
                  label: t(filterOperatorKey(op)),
                }))}
              />
              <Input
                aria-label={t('value')}
                value={filterInput[popoverColumn.id]?.value ?? ''}
                onChange={(event) => {
                  const next = {
                    ...filterInput,
                    [popoverColumn.id]: {
                      op: filterInput[popoverColumn.id]?.op ?? 'eq',
                      value: event.target.value,
                    },
                  }
                  setFilterInput(next)
                  sync.watch(`filter:${tableId}`, 300, () => setFilters(next))
                }}
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  const next = { ...filterInput }
                  delete next[popoverColumn.id]
                  setFilterInput(next)
                  sync.watch(`filter:${tableId}`, 300, () => setFilters(next))
                }}
              >
                {t('clearFilter')}
              </Button>
            </div>
          ) : null}
          {popover.kind === 'row-color' ? (
            <Swatches
              role="background"
              value={popoverRow?.color}
              onPick={(color) => {
                if (checked.length > 1 && popover.rowId && checked.includes(popover.rowId))
                  void paintRows(color)
                else if (popoverRow) void paintRow(popoverRow, color)
              }}
            />
          ) : null}
          {popover.kind === 'cell-color' && popoverRow && popover.columnId ? (
            <Swatches
              role="background"
              value={popoverRow.backgrounds?.[popover.columnId]}
              onPick={(color) => void paintCell(popoverRow, popover.columnId!, color)}
            />
          ) : null}
          {popover.kind === 'relation' && popoverColumn ? (
            <div className="flex flex-col gap-2">
              <SelectField
                label={t('cardinality')}
                value={relationCardinality}
                onValueChange={setRelationCardinality}
                options={[
                  { value: 'many_to_one', label: t(cardinalityKey('many_to_one')) },
                  { value: 'one_to_one', label: t(cardinalityKey('one_to_one')) },
                  { value: 'one_to_many', label: t(cardinalityKey('one_to_many')) },
                ]}
              />
              <SelectField
                label={t('targetTable')}
                value={relationTarget}
                onValueChange={(next) => {
                  setRelationTarget(next)
                  if (next) void saveRelation(popoverColumn, next)
                }}
                options={[
                  { value: '', label: t('targetTable') },
                  ...(projectTables.data?.tables ?? [])
                    .filter((item) => item.id !== tableId)
                    .map((item) => ({ value: item.id, label: item.name })),
                ]}
              />
            </div>
          ) : null}
          {popover.kind === 'icon' && popoverColumn ? (
            <div className="grid grid-cols-5 gap-1">
              {Object.keys(COLUMN_ICONS).map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-label={`${t('icon')} ${name}`}
                  className="flex h-8 items-center justify-center hover:bg-accent"
                  onClick={() => {
                    void saveConfig(popoverColumn, { icon: name })
                    setPopover(null)
                  }}
                >
                  <ColumnIcon name={name} />
                </button>
              ))}
            </div>
          ) : null}
          {popover.kind === 'view' ? (
            <div className="flex flex-col gap-2">
              <Input
                aria-label={t('viewName')}
                value={viewName}
                onChange={(event) => setViewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void saveView()
                }}
              />
              <label htmlFor="shared-view" className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  id="shared-view"
                  checked={sharedView}
                  onCheckedChange={(next) => setSharedView(next === true)}
                />
                {t('shared')}
              </label>
            </div>
          ) : null}
        </AnchoredLayer>
      ) : null}
      <NotesDrawer
        tableId={tableId}
        row={rows.find((row) => row.id === drawerRowId) ?? null}
        onClose={() => setDrawerRowId(null)}
      />
      {formatTarget ? (
        <ConditionalDialog
          key={`${formatTarget.columnId}:${formatTarget.rowId ?? 'column'}`}
          tableId={tableId}
          columnId={formatTarget.columnId}
          columnName={columns.find((column) => column.id === formatTarget.columnId)?.name ?? ''}
          rowLabel={formatTarget.rowId ? `#${rows.find((row) => row.id === formatTarget.rowId)?.rowNumber ?? ''}` : undefined}
          rules={
            formatTarget.rowId
              ? (rows.find((row) => row.id === formatTarget.rowId)?.formats?.[formatTarget.columnId] ?? [])
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

function footerValue(
  calc: string,
  stats: {
    count: number
    empty: number
    filled: number
    unique: number
    sum: number | null
    avg: number | null
    median: number | null
    min: unknown
    max: unknown
  },
) {
  if (calc === 'percent_empty')
    return stats.count === 0 ? '0%' : `${Math.round((stats.empty / stats.count) * 100)}%`
  if (calc === 'percent_filled')
    return stats.count === 0 ? '0%' : `${Math.round((stats.filled / stats.count) * 100)}%`
  if (calc === 'sum') return stats.sum == null ? '' : String(stats.sum)
  if (calc === 'avg') return stats.avg == null ? '' : String(Math.round(stats.avg * 100) / 100)
  if (calc === 'median') return stats.median == null ? '' : String(stats.median)
  if (calc === 'min' || calc === 'max') return stats[calc] == null ? '' : String(stats[calc])
  return String(stats[calc as 'count' | 'unique' | 'empty' | 'filled'] ?? '')
}

