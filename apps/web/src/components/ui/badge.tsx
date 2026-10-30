import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

const colors: Record<string, string> = {
  amber: 'bg-amber-200 text-amber-950',
  green: 'bg-green-200 text-green-950',
  blue: 'bg-blue-200 text-blue-950',
  red: 'bg-red-200 text-red-950',
  violet: 'bg-violet-200 text-violet-950',
  orange: 'bg-orange-200 text-orange-950',
  pink: 'bg-pink-200 text-pink-950',
  teal: 'bg-teal-200 text-teal-950',
  slate: 'bg-slate-200 text-slate-950',
  yellow: 'bg-yellow-200 text-yellow-950',
}

export function Badge({
  color = 'slate',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { color?: string }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', colors[color] ?? colors.slate, className)} {...props} />
}
