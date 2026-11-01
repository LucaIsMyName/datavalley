import {
  dateColumnKind,
  formatDateCellValue,
  formatDateValue,
  isDateRangeValue,
  type DateRangeValue,
} from '@datavalley/shared'
import { CalendarIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import type { DateRange } from 'react-day-picker'
import { calendarLocale, parseDateOnly, splitDatetime, toDateOnlyString } from '../lib/dates'
import type { ViewportAnchor } from '../lib/place-in-viewport'
import { cn } from '../lib/utils'
import { AnchoredLayer } from './anchored-layer'
import { Calendar } from './ui/calendar'
import { Input } from './ui/input'

type DateKind = 'date' | 'datetime'

type DateMode = { range: boolean; includeTime: boolean }

function useAnchoredOpen(autoOpen: boolean, onOpenChange?: (open: boolean) => void) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<ViewportAnchor | null>(null)
  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange

  function setOpenState(next: boolean) {
    setOpen(next)
    onOpenChangeRef.current?.(next)
    if (next) setAnchor(anchorFromElement(triggerRef.current))
    else setAnchor(null)
  }

  useLayoutEffect(() => {
    if (!autoOpen) return
    setOpen(true)
    onOpenChangeRef.current?.(true)
    const measure = () => setAnchor(anchorFromElement(triggerRef.current))
    measure()
    const frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [autoOpen])

  useEffect(() => {
    if (!open) return
    const refresh = () => setAnchor(anchorFromElement(triggerRef.current))
    refresh()
    window.addEventListener('resize', refresh)
    window.addEventListener('scroll', refresh, true)
    return () => {
      window.removeEventListener('resize', refresh)
      window.removeEventListener('scroll', refresh, true)
    }
  }, [open])

  return { triggerRef, open, anchor, setOpenState }
}

function DateModeBar({
  mode,
  onMode,
}: {
  mode: DateMode
  onMode: (patch: { range?: boolean; includeTime?: boolean }) => void
}) {
  const { t } = useTranslation()
  const choice = (pressed: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      aria-pressed={pressed}
      className={cn(
        'h-7 flex-1 px-2 text-xs',
        pressed ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
      )}
      onClick={onClick}
    >
      {label}
    </button>
  )
  return (
    <div className="flex flex-col gap-1 border-t border-border p-2">
      <div className="flex gap-1">
        {choice(!mode.range, t('dateRangeOff'), () => onMode({ range: false }))}
        {choice(mode.range, t('dateRangeOn'), () => onMode({ range: true }))}
      </div>
      <div className="flex gap-1">
        {choice(!mode.includeTime, t('dateIncludeTimeOff'), () => onMode({ includeTime: false }))}
        {choice(mode.includeTime, t('dateIncludeTimeOn'), () => onMode({ includeTime: true }))}
      </div>
    </div>
  )
}

function anchorFromElement(el: HTMLElement | null): ViewportAnchor | null {
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
}

function TriggerButton({
  label,
  value,
  className,
  buttonRef,
  onToggle,
}: {
  label: string
  value: string
  className?: string
  buttonRef: RefObject<HTMLButtonElement | null>
  onToggle: () => void
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      className={cn(
        'inline-flex h-9 min-w-[7.5rem] max-w-full items-center justify-start gap-1 px-1 text-sm font-normal hover:bg-accent',
        !value && 'text-muted-foreground',
        className,
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
    >
      <CalendarIcon className="size-3.5 shrink-0 opacity-70" />
      <span className="truncate">{value || '—'}</span>
    </button>
  )
}

function DatePickerLayer({
  open,
  anchor,
  onClose,
  children,
}: {
  open: boolean
  anchor: ViewportAnchor | null
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-date-picker-trigger]')) return
      if (target?.closest('[data-date-picker-layer]')) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, onClose])

  if (!open || !anchor) return null
  return (
    <AnchoredLayer
      popover
      anchor={anchor}
      prefer="below"
      align="start"
      zIndex={200}
      beside
      className="w-max max-w-[20rem] border border-border bg-card p-0 shadow-md"
    >
      <div data-date-picker-layer>{children}</div>
    </AnchoredLayer>
  )
}

export function DatePickerField({
  label,
  kind,
  value,
  language,
  onChange,
  autoOpen = false,
  onOpenChange,
  mode,
  onMode,
}: {
  label: string
  kind: DateKind
  value: string
  language: string
  onChange: (next: string) => void
  autoOpen?: boolean
  onOpenChange?: (open: boolean) => void
  mode?: DateMode
  onMode?: (patch: { range?: boolean; includeTime?: boolean }) => void
}) {
  const { triggerRef, open, anchor, setOpenState } = useAnchoredOpen(autoOpen, onOpenChange)
  const selected = parseDateOnly(value.split('T')[0] ?? value)
  const [month, setMonth] = useState<Date>(() => selected ?? new Date())
  const shown =
    value && kind === 'datetime'
      ? formatDateValue(value, { kind: 'datetime', locale: language })
      : value
        ? formatDateValue(value, { kind: 'date', locale: language })
        : ''

  return (
    <>
      <span data-date-picker-trigger>
        <TriggerButton
          buttonRef={triggerRef}
          label={label}
          value={shown}
          onToggle={() => setOpenState(!open)}
        />
      </span>
      <DatePickerLayer open={open} anchor={anchor} onClose={() => setOpenState(false)}>
        <Calendar
          mode="single"
          locale={calendarLocale(language)}
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          onSelect={(day) => {
            if (!day) return
            const date = toDateOnlyString(day)
            if (kind === 'datetime') {
              const { time } = splitDatetime(value)
              onChange(time ? `${date}T${time}` : `${date}T00:00`)
            } else {
              onChange(date)
              setOpenState(false)
            }
          }}
        />
        {kind === 'datetime' ? (
          <div className="border-t border-border p-2">
            <Input
              type="time"
              aria-label={label}
              className="h-8"
              value={splitDatetime(value).time}
              onChange={(event) => {
                const date = splitDatetime(value).date || value.slice(0, 10)
                const time = event.target.value
                if (!date) return
                onChange(time ? `${date}T${time}` : date)
              }}
            />
          </div>
        ) : null}
        {mode && onMode ? <DateModeBar mode={mode} onMode={onMode} /> : null}
      </DatePickerLayer>
    </>
  )
}

function rangePayload(kind: DateKind, from: Date, to: Date, current: DateRangeValue | null): DateRangeValue {
  const fromStr = toDateOnlyString(from)
  const toStr = toDateOnlyString(to)
  if (kind !== 'datetime') return { from: fromStr, to: toStr }
  const fromTime = current?.from ? splitDatetime(current.from).time || '00:00' : '00:00'
  const toTime = current?.to ? splitDatetime(current.to).time || '23:59' : '23:59'
  return { from: `${fromStr}T${fromTime}`, to: `${toStr}T${toTime}` }
}

export function DateRangePickerField({
  label,
  kind,
  value,
  language,
  onChange,
  autoOpen = false,
  onOpenChange,
  mode,
  onMode,
}: {
  label: string
  kind: DateKind
  value: DateRangeValue | null
  language: string
  onChange: (next: DateRangeValue | null) => void
  autoOpen?: boolean
  onOpenChange?: (open: boolean) => void
  mode?: DateMode
  onMode?: (patch: { range?: boolean; includeTime?: boolean }) => void
}) {
  const { triggerRef, open, anchor, setOpenState } = useAnchoredOpen(autoOpen, onOpenChange)
  const pendingFrom = useRef<Date | null>(null)
  const from = value?.from ? parseDateOnly(value.from.slice(0, 10)) : undefined
  const to = value?.to ? parseDateOnly(value.to.slice(0, 10)) : undefined
  const range: DateRange | undefined = from || to ? { from, to } : undefined
  const [month, setMonth] = useState<Date>(() => from ?? new Date())
  const shown = value ? formatDateCellValue(value, { type: kind, config: { range: true, includeTime: kind === 'datetime' } }, language) : ''

  function close() {
    if (pendingFrom.current) {
      onChange(rangePayload(kind, pendingFrom.current, pendingFrom.current, value))
      pendingFrom.current = null
    }
    setOpenState(false)
  }

  return (
    <>
      <span data-date-picker-trigger>
        <TriggerButton
          buttonRef={triggerRef}
          label={label}
          value={shown}
          className="min-w-[10rem]"
          onToggle={() => (open ? close() : setOpenState(true))}
        />
      </span>
      <DatePickerLayer open={open} anchor={anchor} onClose={close}>
        <Calendar
          mode="range"
          locale={calendarLocale(language)}
          month={month}
          onMonthChange={setMonth}
          selected={range}
          onSelect={(next) => {
            if (!next?.from) {
              pendingFrom.current = null
              return
            }
            if (!next.to) {
              pendingFrom.current = next.from
              return
            }
            pendingFrom.current = null
            onChange(rangePayload(kind, next.from, next.to, value))
            if (kind !== 'datetime') setOpenState(false)
          }}
        />
        {kind === 'datetime' && value ? (
          <div className="grid grid-cols-2 gap-2 border-t border-border p-2">
            <Input
              type="time"
              aria-label={`${label} from`}
              className="h-8"
              value={splitDatetime(value.from).time || '00:00'}
              onChange={(event) => {
                const date = splitDatetime(value.from).date || value.from.slice(0, 10)
                onChange({ ...value, from: event.target.value ? `${date}T${event.target.value}` : date })
              }}
            />
            <Input
              type="time"
              aria-label={`${label} to`}
              className="h-8"
              value={splitDatetime(value.to).time || '23:59'}
              onChange={(event) => {
                const date = splitDatetime(value.to).date || value.to.slice(0, 10)
                onChange({ ...value, to: event.target.value ? `${date}T${event.target.value}` : date })
              }}
            />
          </div>
        ) : null}
        {mode && onMode ? <DateModeBar mode={mode} onMode={onMode} /> : null}
      </DatePickerLayer>
    </>
  )
}

export function DateCellEditor({
  column,
  value,
  onEdit,
  onCalendarOpenChange,
  onMode,
}: {
  column: { type: string; name: string; config?: Record<string, unknown> }
  value: unknown
  onEdit: (value: string | DateRangeValue | null, delay?: number) => void
  onCalendarOpenChange?: (open: boolean) => void
  onMode?: (patch: { range?: boolean; includeTime?: boolean }) => void
}) {
  const { t, i18n } = useTranslation()
  const label = t('editColumn', { name: column.name })
  const kind = dateColumnKind(column)
  const range = Boolean(column.config?.range)
  const mode = { range, includeTime: kind === 'datetime' }

  if (range) {
    const current = isDateRangeValue(value) ? value : null
    return (
      <DateRangePickerField
        label={label}
        kind={kind}
        language={i18n.language}
        value={current}
        autoOpen
        mode={onMode ? mode : undefined}
        onMode={onMode}
        onOpenChange={onCalendarOpenChange}
        onChange={(next) => onEdit(next, 0)}
      />
    )
  }

  const raw = typeof value === 'string' ? value : ''
  return (
    <DatePickerField
      label={label}
      kind={kind}
      language={i18n.language}
      value={raw}
      autoOpen
      mode={onMode ? mode : undefined}
      onMode={onMode}
      onOpenChange={onCalendarOpenChange}
      onChange={(next) => onEdit(next, 0)}
    />
  )
}
