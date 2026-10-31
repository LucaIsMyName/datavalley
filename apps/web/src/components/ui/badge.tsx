import { swatchStyle } from '@datavalley/shared'
import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function Badge({
  color = 'slate',
  className,
  style,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { color?: string }) {
  return (
    <span
      className={cn('inline-flex font-mono rounded-full border border-border/50 items-center px-2 py-0.5 text-xs font-medium', className)}
      style={{ ...swatchStyle(color), ...style }}
      {...props}
    />
  )
}
