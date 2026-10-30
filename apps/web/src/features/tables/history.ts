import type { Column, RowRecord } from '@datavalley/api-client'
import { createUndoStack, type FormatRule, type UndoCommand } from '@datavalley/shared'
import { api } from '../../lib/api'

const LIMIT = 10

export type Patch = {
  rowId: string
  version: number
  cells: Record<string, unknown>
  color?: string | null
  backgrounds?: Record<string, string | null>
}

export type RowSnap = {
  id: string
  nextId: string | null
  cells: Record<string, unknown>
  color: string | null
  backgrounds: Record<string, string>
}

export type ColumnSnap = {
  id: string
  name: string
  type: string
  nextId: string | null
  description: string
  config: Record<string, unknown>
  hidden: boolean
  width: number
  frozen: boolean
  options: { label: string; color?: string | null }[]
  cells: { rowId: string; value: unknown; background?: string | null }[]
}

export type Command =
  | { kind: 'patch'; undo: Patch[]; redo: Patch[] }
  | { kind: 'rows-created'; rows: RowSnap[] }
  | { kind: 'rows-deleted'; rows: RowSnap[] }
  | { kind: 'columns-created'; columns: ColumnSnap[] }
  | { kind: 'columns-deleted'; columns: ColumnSnap[] }
  | { kind: 'column-order'; before: string[]; after: string[] }
  | { kind: 'row-moved'; rowId: string; beforeNextId: string | null; afterNextId: string | null }
  | { kind: 'column-renamed'; columnId: string; before: string; after: string }
  | { kind: 'table-renamed'; before: string; after: string }
  | { kind: 'column-type'; columnId: string; beforeType: string; afterType: string; cells: { rowId: string; value: unknown }[] }
  | { kind: 'rules'; before: FormatRule[]; after: FormatRule[] }
  | { kind: 'column-hidden'; columnId: string; before: boolean; after: boolean }

const memory = new Map<string, ReturnType<typeof createUndoStack<Command>>>()

function storageKey(tableId: string) {
  return `dv-table-history:${tableId}`
}

function stackFor(tableId: string) {
  const existing = memory.get(tableId)
  if (existing) return existing
  const stack = createUndoStack<Command>(LIMIT)
  try {
    const raw = sessionStorage.getItem(storageKey(tableId))
    if (raw) {
      const saved = JSON.parse(raw) as { undo?: UndoCommand<Command>[]; redo?: UndoCommand<Command>[] }
      stack.load(saved.undo ?? [], saved.redo ?? [])
    }
  } catch {
    // A private window can block session storage. The stack still works in memory.
  }
  memory.set(tableId, stack)
  return stack
}

function persist(tableId: string) {
  try {
    sessionStorage.setItem(storageKey(tableId), JSON.stringify(stackFor(tableId).snapshot()))
  } catch {
    // Keep the in-memory stack when storage is full.
  }
}

export function pushCommand(tableId: string, command: Command) {
  stackFor(tableId).push({ undo: command, redo: command })
  persist(tableId)
}

export function historyFlags(tableId: string) {
  const snap = stackFor(tableId).snapshot()
  return { canUndo: snap.undo.length > 0, canRedo: snap.redo.length > 0 }
}

async function sendPatch(patch: Patch) {
  const result = await api.request<{ row: RowRecord }>(`/rows/${patch.rowId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      version: patch.version,
      cells: patch.cells,
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.backgrounds ? { backgrounds: patch.backgrounds } : {}),
    }),
  })
  return result.row.version
}

async function rowVersions(tableId: string) {
  const versions = new Map<string, number>()
  let cursor: string | null = null
  do {
    const params = new URLSearchParams({ limit: '100' })
    if (cursor) params.set('cursor', cursor)
    const page = await api.request<{ rows: RowRecord[]; nextCursor: string | null }>(`/tables/${tableId}/rows?${params}`)
    for (const row of page.rows) versions.set(row.id, row.version)
    cursor = page.nextCursor
  } while (cursor)
  return versions
}

async function createFromSnap(tableId: string, row: RowSnap) {
  const created = await api.request<{ row: { id: string; version: number } }>(`/tables/${tableId}/rows`, {
    method: 'POST',
    body: JSON.stringify({ cells: row.cells, ...(row.nextId ? { beforeId: row.nextId } : {}) }),
  })
  if (row.color || Object.keys(row.backgrounds).length > 0) {
    await api.request(`/rows/${created.row.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ version: created.row.version, cells: {}, color: row.color, backgrounds: row.backgrounds }),
    })
  }
  return created.row.id
}

async function restoreRows(tableId: string, rows: RowSnap[]) {
  const restored: RowSnap[] = []
  let insertedBefore: string | null = null
  for (const row of [...rows].reverse()) {
    const nextId = insertedBefore ?? row.nextId
    const id = await createFromSnap(tableId, { ...row, nextId })
    insertedBefore = id
    restored.push({ ...row, id, nextId })
  }
  return restored.reverse()
}

async function restoreColumns(tableId: string, columns: ColumnSnap[]) {
  const restored: ColumnSnap[] = []
  let insertedBefore: string | null = null
  const versions = await rowVersions(tableId)
  for (const source of [...columns].reverse()) {
    const nextId: string | null = insertedBefore ?? source.nextId
    const created: { column: Column } = await api.request<{ column: Column }>(`/tables/${tableId}/columns`, {
      method: 'POST',
      body: JSON.stringify({
        name: source.name,
        type: source.type,
        description: source.description,
        config: source.config,
        options: source.options.map((option) => ({ label: option.label, color: option.color ?? undefined })),
        ...(nextId ? { beforeId: nextId } : {}),
      }),
    })
    await api.request(`/columns/${created.column.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ hidden: source.hidden, width: source.width, frozen: source.frozen }),
    })
    for (const cell of source.cells) {
      const version = versions.get(cell.rowId)
      if (version == null || (cell.value == null && !cell.background)) continue
      const fresh = await sendPatch({
        rowId: cell.rowId,
        version,
        cells: cell.value == null ? {} : { [created.column.id]: cell.value },
        backgrounds: cell.background ? { [created.column.id]: cell.background } : undefined,
      })
      versions.set(cell.rowId, fresh)
    }
    insertedBefore = created.column.id
    restored.push({ ...source, id: created.column.id, nextId })
  }
  return restored.reverse()
}

async function moveBefore(tableId: string, rowId: string, beforeId: string | null) {
  await api.request(`/tables/${tableId}/rows/move`, {
    method: 'POST',
    body: JSON.stringify({ rowId, ...(beforeId ? { beforeId } : {}) }),
  })
}

async function run(tableId: string, command: Command, direction: 'undo' | 'redo'): Promise<Command> {
  if (command.kind === 'patch') {
    const source = direction === 'undo' ? command.undo : command.redo
    const versions = new Map<string, number>()
    for (const patch of source) versions.set(patch.rowId, await sendPatch(patch))
    const stamp = (patch: Patch) => ({ ...patch, version: versions.get(patch.rowId) ?? patch.version })
    return { kind: 'patch', undo: command.undo.map(stamp), redo: command.redo.map(stamp) }
  }
  if (command.kind === 'rows-created') {
    if (direction === 'undo') {
      for (const row of command.rows) await api.request(`/rows/${row.id}`, { method: 'DELETE' })
      return command
    }
    return { kind: 'rows-created', rows: await restoreRows(tableId, command.rows) }
  }
  if (command.kind === 'rows-deleted') {
    if (direction === 'undo') return { kind: 'rows-deleted', rows: await restoreRows(tableId, command.rows) }
    for (const row of command.rows) await api.request(`/rows/${row.id}`, { method: 'DELETE' })
    return command
  }
  if (command.kind === 'columns-created') {
    if (direction === 'undo') {
      for (const column of command.columns) await api.request(`/columns/${column.id}`, { method: 'DELETE' })
      return command
    }
    return { kind: 'columns-created', columns: await restoreColumns(tableId, command.columns) }
  }
  if (command.kind === 'columns-deleted') {
    if (direction === 'undo') return { kind: 'columns-deleted', columns: await restoreColumns(tableId, command.columns) }
    for (const column of command.columns) await api.request(`/columns/${column.id}`, { method: 'DELETE' })
    return command
  }
  if (command.kind === 'column-order') {
    await api.request(`/tables/${tableId}/columns/order`, {
      method: 'PUT',
      body: JSON.stringify({ columnIds: direction === 'undo' ? command.before : command.after }),
    })
    return command
  }
  if (command.kind === 'row-moved') {
    await moveBefore(tableId, command.rowId, direction === 'undo' ? command.beforeNextId : command.afterNextId)
    return command
  }
  if (command.kind === 'column-renamed') {
    await api.request(`/columns/${command.columnId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: direction === 'undo' ? command.before : command.after }),
    })
    return command
  }
  if (command.kind === 'table-renamed') {
    await api.request(`/tables/${tableId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: direction === 'undo' ? command.before : command.after }),
    })
    return command
  }
  if (command.kind === 'column-type') {
    const type = direction === 'undo' ? command.beforeType : command.afterType
    await api.request(`/columns/${command.columnId}/convert`, { method: 'POST', body: JSON.stringify({ type }) })
    if (direction === 'undo') {
      const versions = await rowVersions(tableId)
      for (const cell of command.cells) {
        const version = versions.get(cell.rowId)
        if (version == null) continue
        const fresh = await sendPatch({ rowId: cell.rowId, version, cells: { [command.columnId]: cell.value } })
        versions.set(cell.rowId, fresh)
      }
    }
    return command
  }
  if (command.kind === 'rules') {
    await api.request(`/tables/${tableId}`, {
      method: 'PATCH',
      body: JSON.stringify({ formatRules: direction === 'undo' ? command.before : command.after }),
    })
    return command
  }
  await api.request(`/columns/${command.columnId}`, {
    method: 'PATCH',
    body: JSON.stringify({ hidden: direction === 'undo' ? command.before : command.after }),
  })
  return command
}

async function step(tableId: string, direction: 'undo' | 'redo') {
  const stack = stackFor(tableId)
  const entry = direction === 'undo' ? stack.popUndo() : stack.popRedo()
  if (!entry) return false
  try {
    const next = await run(tableId, direction === 'undo' ? entry.undo : entry.redo, direction)
    entry.undo = next
    entry.redo = next
    persist(tableId)
    return true
  } catch (error) {
    if (direction === 'undo') stack.popRedo()
    else stack.popUndo()
    persist(tableId)
    throw error
  }
}

export function undoTable(tableId: string) {
  return step(tableId, 'undo')
}

export function redoTable(tableId: string) {
  return step(tableId, 'redo')
}
