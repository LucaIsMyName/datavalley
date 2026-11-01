import { isRouteErrorResponse, useRouteError } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ErrorState } from '../components/states'
import { Button } from '../components/ui/button'

export function routeErrorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    const data = error.data
    if (typeof data === 'string' && data.trim()) return data
    if (
      data &&
      typeof data === 'object' &&
      'message' in data &&
      typeof data.message === 'string' &&
      data.message.trim()
    ) {
      return data.message
    }
    return error.statusText
  }
  if (error instanceof Error && error.message) return error.message
  return ''
}

export function RouteErrorPage() {
  const error = useRouteError()
  const { t } = useTranslation()
  const detail = routeErrorMessage(error)
  return (
    <section className="flex min-h-0 flex-1 flex-col items-start gap-3 p-4 md:p-6">
      <ErrorState message={detail || t('error')} />
      <Button type="button" variant="outline" onClick={() => window.location.reload()}>
        {t('tryAgain')}
      </Button>
    </section>
  )
}
