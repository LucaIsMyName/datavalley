import { filtersFrom } from './grid-model'
import { anchor, showEditError } from './grid-edit'
import { type Column, type RowRecord, type TableRecord } from '@datavalley/api-client'
import { type FilterNode, type FormatRule } from '@datavalley/shared'
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Bookmark,
  ClipboardPaste,
  Copy,
  Download,
  Eraser,
  Eye,
  ListChecks,
  Palette,
  Pencil,
  Redo2,
  Save,
  Search,
  Sigma,
  Star,
  ArrowUpRight,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-react'
import { type MouseEvent as ReactMouseEvent } from 'react'
import { api } from '../../lib/api'
import { sync } from '../../lib/sync'
import { buildColumnHeaderMenu } from './column-menu'
import { displayCellValue } from './cell-display'
import { deleteTableInProject } from './table-delete'

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

type Scope = Record<string, any> & {
  t: any
  i18n: any
  navigate: any
  openMenu: any
  replaceMenu: any
  queryClient: any
  setCsvImportOpen: any
  sort: any
  setSort: any
  setFilterInput: any
  setFilters: any
  checked: any
  setChecked: any
  fill: any
  setRenamingColumn: any
  setPopover: any
  setConfirm: any
  setRelationTarget: any
  setFormatTarget: any
  viewName: any
  setViewName: any
  sharedView: any
  setDrawerRowId: any
  filter: any
  table: any
  dataReadOnly: any
  cellWritable: any
  setLockPending: any
  columns: any
  rules: any
  projectId: any
  rowsRef: any
  scheduleCell: any
  footerConfig: any
  views: any
  projectTables: any
  flags: any
  tableId: any
  undo: any
  activateCell: any
  openNewColumn: any
  cycleSort: any
}

export function useTableMenus(scope: Scope) {
  const {
    t,
    i18n,
    navigate,
    openMenu,
    replaceMenu,
    queryClient,
    setCsvImportOpen,
    sort,
    setSort,
    setFilterInput,
    setFilters,
    checked,
    setChecked,
    setRenamingColumn,
    setPopover,
    setConfirm,
    setRelationTarget,
    setFormatTarget,
    viewName,
    setViewName,
    sharedView,
    setDrawerRowId,
    filter,
    table,
    dataReadOnly,
    cellWritable,
    setLockPending,
    columns,
    rules,
    projectId,
    rowsRef,
    scheduleCell,
    footerConfig,
    views,
    projectTables,
    flags,
    tableId,
    undo,
    activateCell,
    openNewColumn,
    cycleSort,
    applyType,
    duplicateSelectedColumns,
    fillDown,
    saveConfig,
    applyDateMode,
    applySelectMode,
    setFooterCalc,
    hideColumn,
    deleteColumns,
    insertRow,
    duplicateSelectedRows,
    deleteRows,
    pasteTsv,
    setFooter,
  } = scope
  function openColumnMenu(event: ReactMouseEvent, column: Column, expandCurrency?: boolean) {
    event.stopPropagation()
    const point = anchor(event)

    function entriesFor(col: Column, expand?: boolean) {
      return buildColumnHeaderMenu({
        column: col,
        checkedCount: checked.length,
        readOnly: dataReadOnly,
        label: (key) => t(key),
        expandCurrency: expand,
        onSelect: (id) => onColumnMenuSelect(col, id),
      })
    }

    function onColumnMenuSelect(col: Column, id: string) {
      if (id === 'rename') {
        setRenamingColumn(col.id)
        return
      }
      if (id.startsWith('type-')) {
        const type = id.slice('type-'.length)
        if (type === 'relation') {
          setRelationTarget('')
          setPopover({ kind: 'relation', columnId: col.id, ...point })
          return
        }
        void applyType(col, type)
        return
      }
      if (id === 'sort') {
        cycleSort(col.id)
        return
      }
      if (id === 'filter') {
        setPopover({ kind: 'filter', columnId: col.id, ...point })
        return
      }
      if (id === 'left') {
        openNewColumn(col.id, point)
        return
      }
      if (id === 'right') {
        openNewColumn(columns[columns.findIndex((item: any) => item.id === col.id) + 1]?.id, point)
        return
      }
      if (id === 'duplicate') {
        void duplicateSelectedColumns([col.id])
        return
      }
      if (id === 'fill') {
        void fillDown(col.id)
        return
      }
      if (id === 'conditional') {
        setFormatTarget({ columnId: col.id })
        return
      }
      if (id.startsWith('variant-')) {
        const variant = id.slice('variant-'.length)
        if (variant === 'money' && String(col.config.variant ?? 'float') !== 'money') {
          void saveConfig(col, { variant: 'money' }).then((ok: any) => {
            if (!ok) return
            replaceMenu(entriesFor({ ...col, config: { ...col.config, variant: 'money' } }, true))
          })
          return
        }
        void saveConfig(col, { variant })
        return
      }
      if (id.startsWith('currency-')) {
        void saveConfig(col, { currency: id.slice('currency-'.length) })
        return
      }
      if (id.startsWith('style-')) {
        void saveConfig(col, { style: id.slice('style-'.length) })
        return
      }
      if (id === 'include-time-on') {
        void applyDateMode(col, { includeTime: true })
        return
      }
      if (id === 'include-time-off') {
        void applyDateMode(col, { includeTime: false })
        return
      }
      if (id === 'range-on') {
        void applyDateMode(col, { range: true })
        return
      }
      if (id === 'range-off') {
        void applyDateMode(col, { range: false })
        return
      }
      if (id === 'select-multiple-on') {
        void applySelectMode(col, { multiple: true })
        return
      }
      if (id === 'select-multiple-off') {
        void applySelectMode(col, { multiple: false })
        return
      }
      if (id === 'manage-select-options') {
        setPopover({ kind: 'select-options', columnId: col.id, ...point })
        return
      }
      if (id.startsWith('footer-')) {
        void setFooterCalc(col.id, id.slice('footer-'.length))
        return
      }
      if (id === 'hide') {
        void hideColumn(col, true)
        return
      }
      if (id === 'delete') void deleteColumns([col.id])
    }

    openMenu(event, entriesFor(column, expandCurrency))
  }

  function openRowMenu(event: ReactMouseEvent, row: RowRecord) {
    event.stopPropagation()
    const point = anchor(event)
    const list = rowsRef.current
    const index = list.findIndex((item: any) => item.id === row.id)
    openMenu(
      event,
      dataReadOnly
        ? [
            {
              id: 'notes',
              label: t('notes'),
              icon: ArrowUpRight,
              onSelect: () => setDrawerRowId(row.id),
            },
            {
              id: 'select',
              label: t('selectRow'),
              icon: ListChecks,
              onSelect: () =>
                setChecked((current: any) =>
                  current.includes(row.id) ? current : [...current, row.id],
                ),
            },
          ]
        : [
            {
              id: 'notes',
              label: t('notes'),
              icon: ArrowUpRight,
              onSelect: () => setDrawerRowId(row.id),
            },
            {
              id: 'above',
              label: t('insertAbove'),
              icon: ArrowUpToLine,
              onSelect: () => void insertRow(row.id),
            },
            {
              id: 'below',
              label: t('insertBelow'),
              icon: ArrowDownToLine,
              onSelect: () => void insertRow(list[index + 1]?.id),
            },
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
                setChecked((current: any) =>
                  current.includes(row.id) ? current : [...current, row.id],
                ),
            },
            {
              id: 'delete',
              label: t('delete'),
              icon: Trash2,
              danger: true,
              onSelect: () => void deleteRows([row.id]),
            },
          ],
    )
  }

  function openCellMenu(event: ReactMouseEvent, row: RowRecord, column: Column) {
    event.stopPropagation()
    const point = anchor(event)
    openMenu(event, [
      {
        id: 'edit',
        label: t('edit'),
        icon: Pencil,
        disabled: !cellWritable(column) && column.type !== 'formula',
        onSelect: () => activateCell(row, column),
      },
      {
        id: 'copy',
        label: t('copy'),
        icon: Copy,
        onSelect: () =>
          void navigator.clipboard.writeText(
            displayCellValue(column, row.cells[column.id], i18n.language),
          ),
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
        disabled: !cellWritable(column),
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

  function openTitleMenu(event: ReactMouseEvent) {
    const point = anchor(event)
    const hidden = columns.filter((column: any) => column.hidden)
    openMenu(event, [
      {
        id: 'undo',
        label: t('undo'),
        icon: Undo2,
        disabled: !flags.canUndo,
        onSelect: () => void undo('undo'),
      },
      {
        id: 'redo',
        label: t('redo'),
        icon: Redo2,
        disabled: !flags.canRedo,
        onSelect: () => void undo('redo'),
      },
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
      {
        id: 'footer',
        label: t('footer'),
        icon: Sigma,
        onSelect: () => void setFooter(!footerConfig.enabled),
      },
      { id: 'import', label: t('import'), icon: Upload, onSelect: () => setCsvImportOpen(true) },
      ...(views.data?.views ?? []).map((view: any) => ({
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
      ...hidden.map((column: any) => ({
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
    if (!projectId) return
    try {
      await deleteTableInProject({
        projectId,
        tableId,
        tables: projectTables.data?.tables ?? [],
        activeTableId: tableId,
        queryClient,
        navigate,
        api,
      })
    } catch (caught) {
      showEditError(caught instanceof Error ? caught.message : t('error'))
    }
  }

  async function toggleTableLock() {
    if (!table || table.mirrorOfTableId) return
    setLockPending(true)
    try {
      const endpoint = table.lockedAt ? 'unlock' : 'lock'
      const result = await api.request<{ table: TableRecord }>(`/tables/${tableId}/${endpoint}`, {
        method: 'POST',
      })
      queryClient.setQueryData(['table', tableId], { table: { ...table, ...result.table } })
      queryClient.setQueryData(
        ['tables', projectId],
        (current: { tables: TableRecord[] } | undefined) => {
          if (!current) return current
          return {
            tables: current.tables.map((item) =>
              item.id === tableId ? { ...item, lockedAt: result.table.lockedAt } : item,
            ),
          }
        },
      )
    } catch (caught) {
      showEditError(caught instanceof Error ? caught.message : t('error'))
    } finally {
      setLockPending(false)
    }
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
  return {
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
  }
}
