import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

const EMPTY = '__dv_empty__'

function toRadix(value: string | undefined) {
  if (value === '') return EMPTY
  return value
}

function fromRadix(value: string) {
  return value === EMPTY ? '' : value
}

export function Select({ value, onValueChange, ...props }: ComponentProps<typeof SelectPrimitive.Root>) {
  return (
    <SelectPrimitive.Root
      {...props}
      value={toRadix(value)}
      onValueChange={onValueChange ? (next) => onValueChange(fromRadix(next)) : undefined}
    />
  )
}

export function SelectTrigger({ className, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      type="button"
      className={cn(
        'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-2 text-left text-base outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Value />
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className={cn(
          'z-50 max-h-72 w-[var(--radix-select-trigger-width)] min-w-32 max-w-[min(20rem,calc(100vw-2rem))] overflow-auto rounded-md border border-border bg-card p-1 text-base shadow-md md:text-sm',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

export function SelectItem({ className, children, value, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      value={value === '' ? EMPTY : value}
      className={cn(
        'relative flex min-h-9 cursor-pointer items-center rounded-sm py-1.5 pr-8 pl-2 outline-none select-none focus:bg-accent data-[disabled]:opacity-40',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2">
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export function SelectField({
  label,
  value,
  onValueChange,
  options,
  className,
}: {
  label: string
  value: string
  onValueChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={label} className={className}>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={`${option.value}:${option.label}`} value={option.value}>
            {option.label || '\u00a0'}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
