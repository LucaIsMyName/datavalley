import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import type { ButtonHTMLAttributes, MouseEvent } from 'react'
import { DayPicker, type DayPickerProps } from 'react-day-picker'
import { cn } from '../../lib/utils'
import { calendarBounds } from './calendar-bounds'
import { CalendarDropdown } from './calendar-dropdown'

export type CalendarProps = DayPickerProps

function NavButton({ onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      ref={(node) => {
        if (!node) return
        node.onclick = (event) => {
          event.preventDefault()
          event.stopPropagation()
          onClick?.(event as unknown as MouseEvent<HTMLButtonElement>)
        }
      }}
    />
  )
}

export function Calendar({ className, classNames, showOutsideDays = true, startMonth, endMonth, ...props }: CalendarProps) {
  const bounds = calendarBounds()
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      navLayout="around"
      captionLayout="dropdown"
      startMonth={startMonth ?? bounds.startMonth}
      endMonth={endMonth ?? bounds.endMonth}
      className={cn('p-1', className)}
      classNames={{
        months: 'flex flex-col gap-2',
        month: 'relative flex flex-col gap-2',
        month_caption: 'relative z-0 flex h-8 items-center justify-center gap-1 px-8',
        caption_label: 'sr-only',
        dropdowns: 'flex items-center gap-1',
        dropdown_root: 'inline-flex',
        dropdown: 'h-7 max-w-28 border border-border bg-card px-1 text-sm',
        button_previous:
          'absolute left-0 top-0 z-10 inline-flex size-7 items-center justify-center hover:bg-accent',
        button_next:
          'absolute right-0 top-0 z-10 inline-flex size-7 items-center justify-center hover:bg-accent',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'text-muted-foreground w-8 text-[0.7rem] font-normal',
        week: 'flex w-full mt-1',
        day: 'relative p-0 text-center text-sm',
        day_button: 'inline-flex size-8 items-center justify-center p-0 font-normal hover:bg-accent',
        selected: 'bg-primary text-primary-foreground',
        today: 'bg-accent text-accent-foreground',
        outside: 'text-muted-foreground opacity-50',
        disabled: 'text-muted-foreground opacity-50',
        range_middle: 'bg-accent text-accent-foreground',
        range_start: 'bg-primary text-primary-foreground',
        range_end: 'bg-primary text-primary-foreground',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Dropdown: CalendarDropdown,
        PreviousMonthButton: NavButton,
        NextMonthButton: NavButton,
        Chevron: ({ orientation }) => {
          if (orientation === 'left') return <ChevronLeft className="size-4" />
          if (orientation === 'up') return <ChevronUp className="size-4" />
          if (orientation === 'down') return <ChevronDown className="size-4" />
          return <ChevronRight className="size-4" />
        },
      }}
      {...props}
    />
  )
}
