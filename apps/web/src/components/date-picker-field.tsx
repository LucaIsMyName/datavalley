import { formatDateCellValue, formatDateValue, isDateRangeValue, type DateRangeValue } from '@datavalley/shared'
import { CalendarIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DateRange } from 'react-day-picker'
import { calendarLocale, parseDateOnly, splitDatetime, toDateOnlyString } from '../lib/dates'
import { cn } from '../lib/utils'
import { Calendar } from './ui/calendar'
import { Input } from './ui/input'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { Button } from './ui/button'

type DateKind = 'date' | 'datetime'

function TriggerButton({
  label,
  value,
  className,
  onClick,
}: {
  label: string
  value: string
  className?: string
  onClick?: () => void
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'h-9 min-w-[7.5rem] max-w-full justify-start gap-1 px-1 font-normal hover:bg-accent',
        !value && 'text-muted-foreground',
        className,
      )}
    >
      <CalendarIcon className="size-3.5 shrink-0 opacity-70" />
      <span className="truncate">{value || '—'}</span>
    </Button>
  )
}

export function DatePickerField({
  label,
  kind,
  value,
  language,
  onChange,
}: {
  label: string
  kind: DateKind
  value: string
  language: string
  onChange: (next: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = parseDateOnly(value.split('T')[0] ?? value)
  const shown =
    value && kind === 'datetime'
      ? formatDateValue(value, { kind: 'datetime', locale: language })
      : value
        ? formatDateValue(value, { kind: 'date', locale: language })
        : ''
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <TriggerButton label={label} value={shown} />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={calendarLocale(language)}
          selected={selected}
          onSelect={(day) => {
            if (!day) return
            const date = toDateOnlyString(day)
            if (kind === 'datetime') {
              const { time } = splitDatetime(value)
              onChange(time ? `${date}T${time}` : date)
            } else {
              onChange(date)
              setOpen(false)
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
                const { date } = splitDatetime(value)
                const time = event.target.value
                if (!date) return
                onChange(time ? `${date}T${time}` : date)
              }}
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export function DateRangePickerField({
  label,
  kind,
  value,
  language,
  onChange,
}: {
  label: string
  kind: DateKind
  value: DateRangeValue | null
  language: string
  onChange: (next: DateRangeValue | null) => void
}) {
  const [open, setOpen] = useState(false)
  const from = value?.from ? parseDateOnly(value.from.slice(0, 10)) : undefined
  const to = value?.to ? parseDateOnly(value.to.slice(0, 10)) : undefined
  const range: DateRange | undefined = from || to ? { from, to } : undefined
  const shown = value ? formatDateCellValue(value, { type: kind, config: { range: true } }, language) : ''
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <TriggerButton label={label} value={shown} className="min-w-[10rem]" />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          locale={calendarLocale(language)}
          selected={range}
          onSelect={(next) => {
            if (!next?.from) {
              onChange(null)
              return
            }
            const fromStr = toDateOnlyString(next.from)
            const toStr = next.to ? toDateOnlyString(next.to) : fromStr
            if (kind === 'datetime') {
              onChange({ from: `${fromStr}T00:00`, to: `${toStr}T23:59` })
            } else {
              onChange({ from: fromStr, to: toStr })
            }
            if (next.from && next.to) setOpen(false)
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
      </PopoverContent>
    </Popover>
  )
}

export function normalizeDateCellValue(value: unknown): DateRangeValue | string | null {
  if (value == null || value === '') return null
  if (isDateRangeValue(value)) return value
  if (typeof value === 'string') return value
  return null
}

export function DateCellEditor({
  column,
  value,
  onEdit,
}: {
  column: { type: string; name: string; config?: Record<string, unknown> }
  value: unknown
  onEdit: (value: string | DateRangeValue | null, delay?: number) => void
}) {
  const { t, i18n } = useTranslation()
  const label = t('editColumn', { name: column.name })
  const kind: DateKind = column.type === 'datetime' ? 'datetime' : 'date'
  const range = Boolean(column.config?.range)

  if (range) {
    const current = isDateRangeValue(value) ? value : null
    return (
      <DateRangePickerField
        label={label}
        kind={kind}
        language={i18n.language}
        value={current}
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
      onChange={(next) => onEdit(next, 0)}
    />
  )
}
