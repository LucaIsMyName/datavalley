export type GridKeyCommand =
  'undo' | 'redo' | 'copy' | 'paste' | 'clear' | 'activate' | { type: 'move'; key: string }

type TypingTarget = {
  tagName?: string
  isContentEditable?: boolean
  closest?: (selector: string) => unknown
}

/** True while the user is in a field, including notes and other contenteditable text. */
export function isGridTypingTarget(target: EventTarget | TypingTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const element = target as TypingTarget
  if (element.isContentEditable) return true
  if (typeof element.closest === 'function' && element.closest('[contenteditable="true"]')) return true
  const tag = element.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return Boolean(
    typeof element.closest === 'function' &&
      element.closest('[role="combobox"], [role="listbox"]'),
  )
}

export function gridKeyCommand(
  event: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
  state: { typing: boolean; inGrid: boolean },
): GridKeyCommand | null {
  const { typing, inGrid } = state
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !typing) {
    return event.shiftKey ? 'redo' : 'undo'
  }
  if (!typing && inGrid && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c')
    return 'copy'
  if (!typing && inGrid && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v')
    return 'paste'
  if (!typing && inGrid && (event.key === 'Delete' || event.key === 'Backspace')) return 'clear'
  if (!typing && inGrid && event.key === 'Enter') return 'activate'
  if (
    !typing &&
    inGrid &&
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
  ) {
    return { type: 'move', key: event.key }
  }
  return null
}
