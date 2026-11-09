import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useCrumbs } from './breadcrumbs'

export function Page({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const crumbs = useCrumbs()
  const titleText = typeof title === 'string' ? title : null
  const lastCrumb = crumbs[crumbs.length - 1]?.label
  const hideTitle = titleText != null && crumbs.length > 0 && lastCrumb === titleText
  const showHeader = !hideTitle || Boolean(actions)
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 md:p-6">
      {showHeader ? (
        <header className="flex min-h-10 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {hideTitle ? null : typeof title === 'string' ? (
            <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight">{title}</h1>
          ) : (
            title
          )}
          {actions ? <div className="flex min-h-9 flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  )
}

const pulse = 'animate-pulse bg-muted motion-reduce:animate-none'

export function LoadingBlock({ variant = 'block' }: { variant?: 'block' | 'table' | 'cards' | 'rows' }) {
  const { t } = useTranslation()
  const label = t('loading')
  if (variant === 'table') return <TableSkeleton label={label} />
  if (variant === 'cards') return <CardsSkeleton label={label} />
  if (variant === 'rows') return <RowsSkeleton label={label} />
  return (
    <div className={`h-40 ${pulse}`} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
    </div>
  )
}

function TableSkeleton({ label }: { label: string }) {
  const columns = ['w-24', 'w-32', 'w-20', 'w-16']
  return (
    <div className="border border-border" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="sr-only flex gap-3 border-b border-border bg-card px-3 py-2">
        {columns.map((width) => (
          <span key={width} className={`h-3 ${width} ${pulse} ${width === 'w-16' ? 'ml-auto' : ''}`} />
        ))}
      </div>
      {['w-2/3', 'w-1/2', 'w-3/4', 'w-2/5', 'w-3/5'].map((width) => (
        <div key={width} className="flex h-11 items-center gap-3 border-b border-border px-3 last:border-b-0">
          <span className={`h-3 ${width} ${pulse}`} />
          <span className={`ml-auto h-3 w-16 ${pulse}`} />
        </div>
      ))}
    </div>
  )
}

function CardsSkeleton({ label }: { label: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex min-h-24 flex-col gap-2 border border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <span className={`size-8 shrink-0 ${pulse}`} />
            <span className={`h-3 w-32 ${pulse}`} />
          </div>
          <span className={`h-3 w-full ${pulse}`} />
          <span className={`h-3 w-2/3 ${pulse}`} />
        </div>
      ))}
    </div>
  )
}

function RowsSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {['w-1/2', 'w-2/3', 'w-2/5', 'w-3/5'].map((width) => (
        <div key={width} className="flex min-h-11 items-center gap-2 border-b border-border py-2">
          <span className={`size-8 shrink-0 ${pulse}`} />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className={`h-3 ${width} ${pulse}`} />
            <span className={`h-3 w-1/3 ${pulse}`} />
          </span>
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ title, body, actions }: { title: string; body: string; actions?: ReactNode }) {
  return (
    <div role="status" className="flex min-h-40 flex-col items-center justify-center border border-dashed border-border px-4 py-6 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      {actions ? <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  const { t } = useTranslation()
  return (
    <div role="alert" className="flex h-40 items-center justify-center border border-danger/40 bg-card px-4 text-center text-sm text-danger">
      {message || t('error')}
    </div>
  )
}
