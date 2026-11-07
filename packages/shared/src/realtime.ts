import type { FormatRule } from './formatting.js'

export const presencePalette = ['#e11d48', '#d97706', '#059669', '#2563eb', '#7c3aed', '#db2777', '#0891b2', '#4f46e5']

export function presenceColor(userId: string) {
  let hash = 0
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return presencePalette[hash % presencePalette.length]
}

export type PresenceFocus =
  | { kind: 'cell'; tableId: string; rowId: string; columnId: string }
  | { kind: 'projectName' }
  | { kind: 'projectDescription' }
  | { kind: 'tableName'; tableId: string }
  | { kind: 'columnName'; tableId: string; columnId: string }
  | { kind: 'notes'; tableId: string; rowId: string }
  | { kind: 'formula'; tableId: string; columnId: string; rowId?: string }

export type PresencePerson = {
  userId: string
  username: string
  color: string
  tableId: string | null
  tableName: string | null
  focus: PresenceFocus | null
  editing: boolean
  draft: string | null
}

export type RealtimeRow = {
  id: string
  position: string
  version: number
  color: string | null
  notes: string
  rowNumber: number
  cells: Record<string, unknown>
  backgrounds: Record<string, string>
  formats?: Record<string, FormatRule[]>
}

type EventBase = { id: string; actorId: string }

export type RealtimeEvent =
  | (EventBase & {
      type: 'project.updated'
      project: { id: string; name: string; description: string; icon: string }
    })
  | (EventBase & { type: 'tables.changed'; projectId: string; tableId?: string })
  | (EventBase & { type: 'row.updated'; projectId: string; tableId: string; row: RealtimeRow })
  | (EventBase & { type: 'rows.changed'; projectId: string; tableId: string })
  | (EventBase & { type: 'columns.changed'; projectId: string; tableId: string })
  | (EventBase & { type: 'presence'; projectId: string; upsert: PresencePerson[]; remove: string[] })

type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never

export type RealtimeDraft = WithoutId<RealtimeEvent>

export type RealtimeViewer = {
  canViewTable: (tableId: string) => boolean
  canViewColumn: (tableId: string, columnId: string) => boolean
}

export function focusTableId(focus: PresenceFocus | null) {
  if (!focus || focus.kind === 'projectName' || focus.kind === 'projectDescription') return null
  return focus.tableId
}

export function focusColumn(focus: PresenceFocus | null) {
  if (!focus) return null
  if (focus.kind === 'cell' || focus.kind === 'columnName' || focus.kind === 'formula') {
    return { tableId: focus.tableId, columnId: focus.columnId }
  }
  return null
}

export function sameFocus(left: PresenceFocus | null | undefined, right: PresenceFocus | null | undefined) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null)
}

function redactPerson(person: PresencePerson, viewer: RealtimeViewer): PresencePerson {
  const tableId = focusTableId(person.focus) ?? person.tableId
  if (tableId && !viewer.canViewTable(tableId)) {
    return { ...person, tableId: null, tableName: null, focus: null, draft: null, editing: false }
  }
  const column = focusColumn(person.focus)
  if (column && !viewer.canViewColumn(column.tableId, column.columnId)) {
    return { ...person, focus: null, draft: null, editing: false }
  }
  return person
}

function visibleRecord<T>(tableId: string, record: Record<string, T> | undefined, viewer: RealtimeViewer) {
  if (!record) return record
  const next: Record<string, T> = {}
  for (const [columnId, value] of Object.entries(record)) {
    if (viewer.canViewColumn(tableId, columnId)) next[columnId] = value
  }
  return next
}

export function filterRealtimeEvent(event: RealtimeEvent, viewer: RealtimeViewer): RealtimeEvent | null {
  if (event.type === 'project.updated' || event.type === 'tables.changed') return event
  if (event.type === 'rows.changed' || event.type === 'columns.changed') {
    return viewer.canViewTable(event.tableId) ? event : null
  }
  if (event.type === 'row.updated') {
    if (!viewer.canViewTable(event.tableId)) return null
    return {
      ...event,
      row: {
        ...event.row,
        cells: visibleRecord(event.tableId, event.row.cells, viewer) ?? {},
        backgrounds: visibleRecord(event.tableId, event.row.backgrounds, viewer) ?? {},
        formats: visibleRecord(event.tableId, event.row.formats, viewer),
      },
    }
  }
  return { ...event, upsert: event.upsert.map((person) => redactPerson(person, viewer)) }
}
