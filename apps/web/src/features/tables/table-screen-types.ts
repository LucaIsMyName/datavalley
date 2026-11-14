import type { FilterNode, FormatRule } from '@datavalley/shared'
import type { ViewportAnchor } from '../../lib/place-in-viewport'

export const ADD_COLUMN_WIDTH = 40
export const ROWS_STALE_MS = 30_000

export type PopoverState = {
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

export type ConfirmState = {
  title: string
  body: string
  confirmLabel?: string
  tone?: 'danger' | 'default'
  run: () => Promise<void>
}

export type SavedView = {
  id: string
  name: string
  definition: {
    filter?: FilterNode | null
    sort?: string | { columnId: string; direction?: string } | null
    direction?: string
    formatting?: FormatRule[]
    display?: unknown
  }
}

export function formatConnectorSync(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}