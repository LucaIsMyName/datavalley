import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/utils'

const EMPTY = '__dv_empty__'

/** Shared styling for select controls inside table cells. */
export const cellSelectTriggerClassName =
  'flex h-9 w-full min-w-0 items-center justify-between gap-2 border-0 bg-transparent px-0 text-left text-sm shadow-none outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

export const selectDropdownPanelClassName =
  'z-[200] max-h-72 min-w-[var(--radix-popover-trigger-width)] w-[var(--radix-popover-trigger-width)] max-w-[min(20rem,calc(100vw-2rem))] overflow-auto border border-border bg-card p-1 text-sm shadow-md'

export const selectDropdownItemClassName =
  'relative flex min-h-9 w-full cursor-pointer items-center py-1.5 pr-8 pl-2 text-left outline-none select-none hover:bg-accent focus:bg-accent'

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

export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      type="button"
      className={cn(
        'flex h-9 w-full items-center justify-between gap-2  border border-border bg-card px-2 text-left text-base outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    >
      {children ?? <SelectPrimitive.Value />}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

export function SelectContent({ className, children, style, ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className={cn(
          'pointer-events-auto z-[200] max-h-72 w-[var(--radix-select-trigger-width)] min-w-32 max-w-[min(20rem,calc(100vw-2rem))] overflow-auto  border border-border bg-card p-1 text-base shadow-md md:text-sm',
          className,
        )}
        {...props}
        style={{ ...style, pointerEvents: 'auto' }}
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
        'relative flex min-h-9 cursor-pointer items-center py-1.5 pr-8 pl-2 outline-none select-none focus:bg-accent data-[disabled]:opacity-40',
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
