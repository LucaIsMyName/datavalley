const OUTSIDE_POPOVER_SELECTOR =
  '[data-tag-menu], [data-date-picker-layer], [data-popover], [data-radix-popper-content-wrapper]'

/** Keep Radix Dialog open when the user interacts with portaled cell popovers. */
export function isNotesDialogOutsideTarget(target: EventTarget | null) {
  if (!target || typeof (target as Element).closest !== 'function') return false
  return Boolean((target as Element).closest(OUTSIDE_POPOVER_SELECTOR))
}
