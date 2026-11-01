import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import type { DropdownProps } from 'react-day-picker'
import { cn } from '../../lib/utils'
import { calendarListPosition } from './calendar-list-position'

export function CalendarDropdown({ options, value, onChange, disabled, 'aria-label': ariaLabel }: DropdownProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState({ top: 0, left: 0, maxHeight: 320 })
  const selected = options?.find((option) => String(option.value) === String(value))

  useLayoutEffect(() => {
    if (!open) return
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  function toggle() {
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    setPlace(calendarListPosition(rect, window.innerHeight))
    setOpen((current) => !current)
  }

  function choose(next: number) {
    onChange?.({ target: { value: String(next) } } as ChangeEvent<HTMLSelectElement>)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="h-7 max-w-32 truncate border border-border bg-card px-2 text-left text-sm"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          toggle()
        }}
      >
        {selected?.label}
      </button>
      {open
        ? createPortal(
            <div
              ref={listRef}
              role="listbox"
              data-date-picker-layer
              aria-label={ariaLabel}
              className="fixed z-[260] overflow-y-auto border border-border bg-card py-1 shadow-md"
              style={{ top: place.top, left: place.left, maxHeight: place.maxHeight, minWidth: rootRef.current?.offsetWidth, pointerEvents: 'auto' }}
            >
              {options?.map((option) => {
                const chosen = String(option.value) === String(value)
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={chosen}
                    disabled={option.disabled}
                    className={cn(
                      'block w-full px-2 py-1 text-left text-sm hover:bg-accent disabled:opacity-50',
                      chosen && 'bg-accent',
                    )}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      choose(option.value)
                    }}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
