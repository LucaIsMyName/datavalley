const OUTSIDE_POPOVER_SELECTOR =
  '[data-tag-menu], [data-date-picker-layer], [data-popover], [data-formula-window], [data-radix-popper-content-wrapper], [data-radix-select-content]'

const BLOCK_MENU_SELECTOR = '[data-radix-popper-content-wrapper], [data-notes-block-menu]'

function closestMatch(target: EventTarget | null, selector: string) {
  if (!target || typeof (target as Element).closest !== 'function') return false
  return Boolean((target as Element).closest(selector))
}

/** Keep Radix Dialog open when the user interacts with portaled cell popovers. */
export function isNotesDialogOutsideTarget(target: EventTarget | null) {
  return closestMatch(target, OUTSIDE_POPOVER_SELECTOR)
}

/** Focus moved into the portaled block-type menu, which still belongs to the notes editor. */
export function isNotesBlockMenuTarget(target: EventTarget | null) {
  return closestMatch(target, BLOCK_MENU_SELECTOR)
}
