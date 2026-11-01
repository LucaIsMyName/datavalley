import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DayPicker, type DayPickerProps } from 'react-day-picker'
import { cn } from '../../lib/utils'
import { Button } from './button'

export type CalendarProps = DayPickerProps

export function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-1', className)}
      classNames={{
        months: 'flex flex-col gap-2',
        month: 'flex flex-col gap-2',
        month_caption: 'flex justify-center pt-1 relative items-center w-full',
        caption_label: 'text-sm font-medium',
        nav: 'flex items-center gap-1',
        button_previous: 'absolute left-1',
        button_next: 'absolute right-1',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'text-muted-foreground w-8 text-[0.7rem] font-normal',
        week: 'flex w-full mt-1',
        day: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
        day_button: cn(
          'inline-flex size-8 items-center justify-center p-0 font-normal hover:bg-accent aria-selected:opacity-100',
        ),
        selected: 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
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
        PreviousMonthButton: (buttonProps) => (
          <Button {...buttonProps} type="button" variant="ghost" className="size-7 p-0" />
        ),
        NextMonthButton: (buttonProps) => (
          <Button {...buttonProps} type="button" variant="ghost" className="size-7 p-0" />
        ),
      }}
      {...props}
    />
  )
}
