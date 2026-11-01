import type { MouseEvent as ReactMouseEvent } from 'react'
import { toast } from 'sonner'
import type { ViewportAnchor } from '../../lib/place-in-viewport'

export function showEditError(message: string) {
  toast.error(message, { id: 'table-edit-error' })
}

export function anchor(event: ReactMouseEvent): ViewportAnchor {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}
