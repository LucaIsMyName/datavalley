import { swatchStyle } from '@datavalley/shared'
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function Badge({
  color = 'slate',
  className,
  style,
  image,
  imageSide = 'left',
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  color?: string
  image?: ReactNode
  imageSide?: 'left' | 'right'
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border border-border/50 font-mono text-xs font-medium',
        image
          ? imageSide === 'right'
            ? 'relative h-full items-stretch overflow-hidden py-0 pr-0 pl-2'
            : 'relative h-full items-stretch overflow-hidden py-0 pr-2 pl-0'
          : 'items-center px-2 py-0.5',
        className,
      )}
      style={{ ...swatchStyle(color), ...style }}
      {...props}
    >
      {image && imageSide === 'left' ? <BadgeImage>{image}</BadgeImage> : null}
      {image ? <span className="flex min-w-0 items-center">{children}</span> : children}
      {image && imageSide === 'right' ? <BadgeImage>{image}</BadgeImage> : null}
    </span>
  )
}

function BadgeImage({ children }: { children: ReactNode }) {
  return (
    <span className="block h-full w-[1lh] aspect-square shrink-0 self-stretch overflow-hidden rounded-full p-0">
      <span className="flex size-full items-center justify-center [&>img]:size-full [&>img]:object-cover [&>svg]:size-3">
        {children}
      </span>
    </span>
  )
}
