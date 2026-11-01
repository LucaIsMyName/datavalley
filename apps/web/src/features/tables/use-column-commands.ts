import { nextLabel } from './grid-model'
import { showEditError } from './grid-edit'
import { type Column, type RowRecord, type TableRecord } from '@datavalley/api-client'
import { api } from '../../lib/api'
import { sync } from '../../lib/sync'
import { patchCachedTable } from './cache'
import {
  dateColumnIncludesTime,
  migrateDateCell,
  migrateSelectCell,
  selectColumnMultiple,
} from '@datavalley/shared'
import { countSelectRowsWithMultipleValues } from './select-options-utils'
import { pushCommand, type ColumnSnap } from './history'

type Scope = Record<string, any> & {
  t: any
  queryClient: any
  selectedColumns: any
  setSelectedColumns: any
  selected: any
  setRenamingColumn: any
  popover: any
  setPopover: any
  setConfirm: any
  relationTarget: any
  setRelationTarget: any
  relationCardinality: any
  filter: any
  dataReadOnly: any
  columns: any
  rows: any
  footerConfig: any
  tableId: any
  refresh: any
  fetchRows: any
  loadEveryRow: any
}

export function useColumnCommands(scope: Scope) {
  const {
    t,
    queryClient,
    selectedColumns,
    setSelectedColumns,
    setRenamingColumn,
    popover,
    setPopover,
    setConfirm,
    relationTarget,
    setRelationTarget,
    relationCardinality,
    dataReadOnly,
    columns,
    rows,
    footerConfig,
    tableId,
    refresh,
    fetchRows,
    loadEveryRow,
    rules,
    setFormatTarget,
  } = scope
  async function createColumn(type: string) {
    if (dataReadOnly) return
    const beforeId = popover?.kind === 'new-column' ? popover.beforeId : undefined
    const point = popover
      ? { left: popover.left, top: popover.top, right: popover.right, bottom: popover.bottom }
      : { left: 16, top: 16, right: 16, bottom: 16 }
    setPopover(null)
    const created = await api.request<{ column: Column }>(`/tables/${tableId}/columns`, {
      method: 'POST',
      body: JSON.stringify({
        name: nextLabel(
          columns.map((column: any) => column.name),
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

  async function saveColumnRules(
    columnId: string,
    drafts: { id: string; expression: string; color: string | null; background: string | null }[],
  ) {
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
    const after = [...rules.filter((rule: any) => rule.columnId !== columnId), ...next]
    const saved = await api.request<{ table: TableRecord }>(`/tables/${tableId}`, {
      method: 'PATCH',
      body: JSON.stringify({ formatRules: after }),
    })
    patchCachedTable(queryClient, tableId, (current) => ({
      ...current,
      formatRules: saved.table.formatRules,
    }))
    pushCommand(tableId, { kind: 'rules', before, after: saved.table.formatRules })
    setFormatTarget(null)
  }

  async function applyType(column: Column, type: string, after?: () => Promise<void>) {
    const preview = await api.request<{ cleared: number }>(`/columns/${column.id}/convert`, {
      method: 'POST',
      body: JSON.stringify({ type, dryRun: true }),
    })
    const run = async () => {
      const current = await fetchRows()
      const cells = current.map((row: any) => ({
        rowId: row.id,
        value: row.cells[column.id] ?? null,
      }))
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
    const cells = current.map((row: any) => ({
      rowId: row.id,
      value: row.cells[column.id] ?? null,
    }))
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

  async function deleteColumns(ids: string[]) {
    if (dataReadOnly || ids.length === 0) return
    const loaded = await loadEveryRow()
    const removed = new Set(ids)
    const snaps: ColumnSnap[] = columns
      .filter((column: any) => removed.has(column.id))
      .map((column: any) => {
        const index = columns.findIndex((item: any) => item.id === column.id)
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
          options: column.options.map((option: any) => ({
            label: option.label,
            color: option.color,
          })),
          cells: loaded.map((row: any) => ({
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
    if (dataReadOnly) return
    const selected = columns.filter((column: any) => ids.includes(column.id))
    if (selected.length === 0) return
    const result = await api.request<{ columns: Column[] }>(
      `/tables/${tableId}/columns/duplicate`,
      {
        method: 'POST',
        body: JSON.stringify({ columnIds: selected.map((column: any) => column.id) }),
      },
    )
    const snaps: ColumnSnap[] = result.columns.map((column, index) => {
      const source = selected[index]
      const sourceIndex = columns.findIndex((item: any) => item.id === source.id)
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
        cells: rows.map((row: any) => ({
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
    if (dataReadOnly) return
    const before = columns.map((column: any) => column.id)
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

  async function hideColumn(column: Column, hidden: boolean) {
    if (dataReadOnly) return
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

  async function applyDateMode(column: Column, patch: { range?: boolean; includeTime?: boolean }) {
    const previous = {
      range: Boolean(column.config.range),
      includeTime: dateColumnIncludesTime(column),
    }
    const next = {
      range: patch.range ?? previous.range,
      includeTime: patch.includeTime ?? previous.includeTime,
    }
    if (previous.range === next.range && previous.includeTime === next.includeTime) return
    const saved = await saveConfig(column, patch)
    if (!saved) return
    const collected: RowRecord[] = []
    let cursor: string | null = null
    do {
      const params = new URLSearchParams({ limit: '100' })
      if (cursor) params.set('cursor', cursor)
      const page = await api.request<{ rows: RowRecord[]; nextCursor: string | null }>(
        `/tables/${tableId}/rows?${params}`,
      )
      collected.push(...page.rows)
      cursor = page.nextCursor
    } while (cursor && collected.length < 5000)
    const updates: { rowId: string; version: number; cells: Record<string, unknown> }[] = []
    for (const row of collected) {
      const current = row.cells[column.id] ?? null
      if (current == null || current === '') continue
      const migrated = migrateDateCell(current, next)
      if (JSON.stringify(migrated) === JSON.stringify(current)) continue
      updates.push({ rowId: row.id, version: row.version, cells: { [column.id]: migrated } })
    }
    for (let index = 0; index < updates.length; index += 500) {
      await api.request(`/tables/${tableId}/cells/bulk`, {
        method: 'PATCH',
        body: JSON.stringify({ updates: updates.slice(index, index + 500) }),
      })
    }
    if (updates.length > 0) await refresh()
  }

  async function collectRowsForColumnMigration(limit = 5000) {
    const collected: RowRecord[] = []
    let cursor: string | null = null
    do {
      const params = new URLSearchParams({ limit: '100' })
      if (cursor) params.set('cursor', cursor)
      const page = await api.request<{ rows: RowRecord[]; nextCursor: string | null }>(
        `/tables/${tableId}/rows?${params}`,
      )
      collected.push(...page.rows)
      cursor = page.nextCursor
    } while (cursor && collected.length < limit)
    return collected
  }

  async function applySelectMode(column: Column, patch: { multiple?: boolean }) {
    const previous = selectColumnMultiple(column)
    const next = patch.multiple ?? previous
    if (previous === next) return
    const collected = await collectRowsForColumnMigration()
    const affected = previous && !next ? countSelectRowsWithMultipleValues(collected, column.id) : 0

    const run = async () => {
      const saved = await saveConfig(column, { multiple: next })
      if (!saved) return
      const updates: { rowId: string; version: number; cells: Record<string, unknown> }[] = []
      for (const row of collected) {
        const current = row.cells[column.id] ?? null
        if (current == null || current === '') continue
        const migrated = migrateSelectCell(current, { multiple: next })
        if (JSON.stringify(migrated) === JSON.stringify(current)) continue
        updates.push({ rowId: row.id, version: row.version, cells: { [column.id]: migrated } })
      }
      for (let index = 0; index < updates.length; index += 500) {
        await api.request(`/tables/${tableId}/cells/bulk`, {
          method: 'PATCH',
          body: JSON.stringify({ updates: updates.slice(index, index + 500) }),
        })
      }
      if (updates.length > 0) await refresh()
    }

    if (affected > 0) {
      setConfirm({
        title: t('selectModeSingleTitle'),
        body: t('selectModeSingleBody', { count: affected }),
        run,
      })
      return
    }
    await run()
  }

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
      return true
    } catch {
      showEditError(t('error'))
      await refresh()
      return false
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
  return {
    createColumn,
    scheduleColumnName,
    saveColumnRules,
    applyType,
    saveRelation,
    deleteColumns,
    duplicateSelectedColumns,
    reorderColumns,
    hideColumn,
    applyDateMode,
    collectRowsForColumnMigration,
    applySelectMode,
    saveConfig,
    setFooter,
    setFooterCalc,
  }
}
