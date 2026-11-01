import { showEditError } from './grid-edit'
import { type Column, type RowRecord, type MediaFile } from '@datavalley/api-client'
import { type PointerEvent as ReactPointerEvent } from 'react'
import { toast } from 'sonner'
import { api } from '../../lib/api'
import { mapCachedRows, readCachedRow } from './cache'
import { fillableColumn as fillable } from './cell-display'
import { editFailureMessage } from './edit-error'
import { fillTargets } from './fill-range'
import { mergeMediaIntoCell } from './media-cell'
import { fetchMediaDetails, uploadMedia } from '../../lib/media'
import { pushCommand, type RowSnap } from './history'

type Scope = Record<string, any> & {
  t: any
  queryClient: any
  parentRef: any
  mediaUploadRef: any
  setCsvImportOpen: any
  setCsvImportBusy: any
  mediaUploadTarget: any
  checked: any
  setChecked: any
  selected: any
  fill: any
  setFill: any
  setEditing: any
  setPopover: any
  setMediaPreview: any
  filter: any
  dataReadOnly: any
  cellWritable: any
  visible: any
  rows: any
  rowsRef: any
  applyMediaCell: any
  tableId: any
  refresh: any
  undo: any
  fetchRows: any
}

export function useRowCommands(scope: Scope) {
  const {
    t,
    queryClient,
    parentRef,
    mediaUploadRef,
    setCsvImportOpen,
    setCsvImportBusy,
    mediaUploadTarget,
    checked,
    setChecked,
    selected,
    setFill,
    setEditing,
    setPopover,
    setMediaPreview,
    dataReadOnly,
    cellWritable,
    visible,
    rows,
    rowsRef,
    applyMediaCell,
    tableId,
    refresh,
    fetchRows,
    setFormatTarget,
  } = scope
  async function insertRow(beforeId?: string) {
    if (dataReadOnly) return
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
    const first = visible.find(cellWritable)
    if (first) setEditing(`${created.row.id}:${first.id}`)
    await refresh()
  }

  function requestMediaUpload(rowId: string, columnId: string) {
    mediaUploadTarget.current = { rowId, columnId }
    mediaUploadRef.current?.open()
  }

  async function runCsvImport(input: { file: File; delimiter: string; headerRow: boolean }) {
    setCsvImportBusy(true)
    try {
      const body = new FormData()
      body.append('file', input.file)
      body.append('delimiter', input.delimiter)
      body.append('headerRow', input.headerRow ? 'true' : 'false')
      const result = await api.request<{ created: number; errors: { error?: string }[] }>(
        `/tables/${tableId}/import`,
        { method: 'POST', body },
      )
      const summary = t('imported', { count: result.created })
      if (result.errors[0]?.error) {
        toast.warning(`${summary} ${result.errors[0].error}`)
      } else {
        toast.success(summary)
      }
      setCsvImportOpen(false)
      await refresh()
    } catch (caught) {
      showEditError(caught instanceof Error ? caught.message : t('error'))
    } finally {
      setCsvImportBusy(false)
    }
  }

  async function uploadMediaToCell(rowId: string, column: Column, file: File): Promise<string[]> {
    let saved
    try {
      saved = await uploadMedia(file)
    } catch (error) {
      const message = editFailureMessage(error, t('error'), { cell: true })
      if (message) showEditError(message)
      throw error
    }
    const row =
      readCachedRow(queryClient, tableId, rowId) ??
      rowsRef.current.find((item: any) => item.id === rowId)
    if (!row) {
      showEditError(t('error'))
      throw new Error('Row not found')
    }
    const next = mergeMediaIntoCell(row.cells[column.id], [saved.id])
    await applyMediaCell(row, column, next)
    return next?.fileIds ?? []
  }

  async function openMediaPreview(file: MediaFile, rowId: string, columnId: string) {
    let resolved = file
    if (!file.name || file.mime === 'application/octet-stream') {
      resolved = (await fetchMediaDetails(file.id)).file
    }
    setMediaPreview({ file: resolved, rowId, columnId })
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
    const targets = rows.filter((row: any) => checked.includes(row.id))
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

  async function saveCellRules(
    row: RowRecord,
    columnId: string,
    drafts: { id: string; expression: string; color: string | null; background: string | null }[],
  ) {
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
      undo: [
        {
          rowId: row.id,
          version: result.row.version,
          cells: {},
          formats: { [columnId]: previous },
        },
      ],
      redo: [
        {
          rowId: row.id,
          version: result.row.version,
          cells: {},
          formats: { [columnId]: result.row.formats?.[columnId] ?? next },
        },
      ],
    })
    mapCachedRows(queryClient, tableId, (item) =>
      item.id === row.id ? { ...item, ...result.row } : item,
    )
    setFormatTarget(null)
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
    const index = rows.findIndex((row: any) => row.id === id)
    for (let cursor = index + 1; cursor < rows.length; cursor += 1) {
      if (!removed.has(rows[cursor].id)) return rows[cursor].id
    }
    return null
  }

  async function deleteRows(ids: string[]) {
    if (dataReadOnly || ids.length === 0) return
    const removed = new Set(ids)
    const snaps = rows
      .filter((row: any) => removed.has(row.id))
      .map((row: any) => rowSnap(row, nextKept(row.id, removed)))
    await api.request(`/tables/${tableId}/rows/bulk-delete`, {
      method: 'POST',
      body: JSON.stringify({ rowIds: ids }),
    })
    pushCommand(tableId, { kind: 'rows-deleted', rows: snaps })
    setChecked([])
    await refresh()
  }

  async function duplicateSelectedRows(ids = checked) {
    if (dataReadOnly) return
    const ordered = rows.filter((row: any) => ids.includes(row.id))
    if (ordered.length === 0) return
    const result = await api.request<{ rowIds: string[] }>(`/tables/${tableId}/rows/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ rowIds: ordered.map((row: any) => row.id) }),
    })
    pushCommand(tableId, {
      kind: 'rows-created',
      rows: result.rowIds.map((id, index) => rowSnap({ ...ordered[index], id }, null)),
    })
    setChecked([])
    await refresh()
  }

  async function reorderRow(rowId: string, beforeId: string) {
    if (dataReadOnly) return
    const index = rows.findIndex((row: any) => row.id === rowId)
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

  async function fillDown(columnId: string) {
    if (dataReadOnly) return
    const ordered = rows.filter((row: any) => checked.includes(row.id))
    if (ordered.length < 2) return
    const source = ordered[0].cells[columnId] ?? null
    const previous = ordered
      .slice(1)
      .map((row: any) => ({ rowId: row.id, value: row.cells[columnId] ?? null }))
    await api.request(`/tables/${tableId}/fill`, {
      method: 'POST',
      body: JSON.stringify({ columnId, rowIds: ordered.map((row: any) => row.id) }),
    })
    const fresh = await fetchRows()
    pushCommand(tableId, {
      kind: 'patch',
      undo: previous.map((item: any) => ({
        rowId: item.rowId,
        version: fresh.find((row: any) => row.id === item.rowId)?.version ?? 1,
        cells: { [columnId]: item.value },
      })),
      redo: previous.map((item: any) => ({
        rowId: item.rowId,
        version: fresh.find((row: any) => row.id === item.rowId)?.version ?? 1,
        cells: { [columnId]: source },
      })),
    })
    setChecked([])
    await refresh()
  }

  async function pasteTsv(text: string) {
    if (dataReadOnly) return
    const grid = text
      .replace(/\r/g, '')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => line.split('\t'))
    const targets = visible.slice(selected.column).filter(cellWritable)
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
        version: fresh.find((row: any) => row.id === item.rowId)?.version ?? item.version,
      }))
    pushCommand(tableId, { kind: 'patch', undo: stamp(previous), redo: stamp(updates) })
    await refresh()
  }

  async function commitFormulaFill(column: Column, sourceRowId: string, rowIds: string[]) {
    const result = await api.request<{
      expression: string
      previous: { rowId: string; source: string }[]
    }>(`/tables/${tableId}/formulas/fill`, {
      method: 'POST',
      body: JSON.stringify({ columnId: column.id, sourceRowId, rowIds }),
    })
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
      const row = rows.find((item: any) => item.id === rowId)
      return { rowId, version: row?.version ?? 1, cells: { [column.id]: value } }
    })
    const previous = ids.map((rowId) => {
      const row = rows.find((item: any) => item.id === rowId)
      return {
        rowId,
        version: row?.version ?? 1,
        cells: { [column.id]: row?.cells[column.id] ?? null },
      }
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
          version: fresh.find((row: any) => row.id === item.rowId)?.version ?? item.version,
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
  return {
    insertRow,
    requestMediaUpload,
    runCsvImport,
    uploadMediaToCell,
    openMediaPreview,
    paintRow,
    paintCell,
    paintRows,
    saveCellRules,
    rowSnap,
    nextKept,
    deleteRows,
    duplicateSelectedRows,
    reorderRow,
    fillDown,
    pasteTsv,
    commitFormulaFill,
    commitFill,
    rowIndexAt,
    beginFill,
  }
}
