import type { MouseEvent as ReactMouseEvent } from 'react'
import { toast } from 'sonner'
import type { ViewportAnchor } from '../../lib/place-in-viewport'

export function showEditError(message: string) {
  toast.error(message, { id: 'table-edit-error' })
}

/** Clears editing only when the cell that finished is still the active one. */
export function editingAfterRelease(current: string | null, releasedKey: string): string | null {
  return current === releasedKey ? null : current
}

export function columnFeedsFooter(
  footer: { enabled?: boolean; columns?: Record<string, string | null | undefined> } | null | undefined,
  columnId: string,
) {
  if (!footer?.enabled) return false
  const calc = footer.columns?.[columnId]
  return typeof calc === 'string' && calc.length > 0
}

export function invalidSignatureFor(
  rowId: string,
  invalidCells: Record<string, { message: string } | undefined>,
) {
  let text = ''
  for (const [key, value] of Object.entries(invalidCells)) {
    if (!key.startsWith(`cell:${rowId}:`) || !value) continue
    text += `${key}=${value.message}|`
  }
  return text
}

export function columnHasFormatRules(
  rules: { columnId?: string }[],
  cellRules: unknown[] | undefined,
  columnId: string,
) {
  if (cellRules && cellRules.length > 0) return true
  return rules.some((rule) => !rule.columnId || rule.columnId === columnId)
}

export function anchor(event: ReactMouseEvent): ViewportAnchor {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}
