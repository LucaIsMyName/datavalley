import type { MouseEvent as ReactMouseEvent } from 'react'

const handlers = new Set<(event: ReactMouseEvent) => void>()

export function registerTableMenu(handler: (event: ReactMouseEvent) => void) {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

export function openRegisteredTableMenu(event: ReactMouseEvent) {
  const handler = [...handlers].at(-1)
  if (!handler) return
  handler(event)
}
