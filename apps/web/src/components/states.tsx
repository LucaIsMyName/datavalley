import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
      <header className="flex min-h-10 items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <div className="flex min-h-9 items-center gap-2">{actions}</div>
      </header>
      {children}
    </section>
  )
}

export function LoadingBlock() {
  return <div className="h-40 animate-pulse rounded-md bg-muted" aria-hidden />
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center rounded-md border border-dashed border-border text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex h-40 items-center justify-center rounded-md border border-danger/40 bg-card px-4 text-sm text-danger">
      {t('error')}: {message}
    </div>
  )
}
