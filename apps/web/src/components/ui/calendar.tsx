import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker, type DayPickerProps } from 'react-day-picker'
import { cn } from '../../lib/utils'

export type CalendarProps = DayPickerProps

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      navLayout="around"
      className={cn('p-1', className)}
      classNames={{
        months: 'flex flex-col gap-2',
        month: 'relative flex flex-col gap-2',
        month_caption: 'flex h-8 items-center justify-center',
        caption_label: 'text-sm font-medium',
        button_previous:
          'absolute left-0 top-0 inline-flex size-7 items-center justify-center hover:bg-accent',
        button_next:
          'absolute right-0 top-0 inline-flex size-7 items-center justify-center hover:bg-accent',
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
        Chevron: ({ orientation }) =>
          orientation === 'left' ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />,
      }}
      {...props}
    />
  )
}
