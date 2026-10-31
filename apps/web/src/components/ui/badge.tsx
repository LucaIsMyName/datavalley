import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

const colors: Record<string, string> = {
  amber: 'bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-200',
  green: 'bg-green-200 text-green-950 dark:bg-green-900 dark:text-green-200',
  blue: 'bg-blue-200 text-blue-950 dark:bg-blue-900 dark:text-blue-200',
  red: 'bg-red-200 text-red-950 dark:bg-red-900 dark:text-red-200',
  violet: 'bg-violet-200 text-violet-950 dark:bg-violet-900 dark:text-violet-200',
  orange: 'bg-orange-200 text-orange-950 dark:bg-orange-900 dark:text-orange-200',
  pink: 'bg-pink-200 text-pink-950 dark:bg-pink-900 dark:text-pink-200',
  teal: 'bg-teal-200 text-teal-950 dark:bg-teal-900 dark:text-teal-200',
  slate: 'bg-slate-200 text-slate-950 dark:bg-slate-700 dark:text-slate-200',
  yellow: 'bg-yellow-200 text-yellow-950 dark:bg-yellow-900 dark:text-yellow-200',
}

export function Badge({
  color = 'slate',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { color?: string }) {
  return <span className={cn('inline-flex items-center  px-2 py-0.5 text-xs font-medium', colors[color] ?? colors.slate, className)} {...props} />
}
