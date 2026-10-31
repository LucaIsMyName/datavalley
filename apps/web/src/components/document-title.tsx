import { useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { useCrumbs, type Crumb } from './breadcrumbs'

export function formatDocumentTitle(segments: string[], appName: string) {
  const parts = segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0 && segment !== '…')
  if (parts.length === 0) return appName
  return `${parts.join(' · ')} · ${appName}`
}

export function titleSegmentsFromCrumbs(crumbs: Crumb[]) {
  if (crumbs.length === 0) return []
  if (crumbs.length >= 3 && crumbs[0].to) {
    const parent = crumbs[crumbs.length - 2]?.label ?? ''
    const current = crumbs[crumbs.length - 1]?.label ?? ''
    return [current, parent]
  }
  if (crumbs.length === 2 && crumbs[0].to) {
    return [crumbs[1].label]
  }
  return [crumbs[crumbs.length - 1].label]
}

export function DocumentTitle({ segments }: { segments: string[] }) {
  const { t } = useTranslation()
  const title = formatDocumentTitle(segments, t('appName'))
  useEffect(() => {
    document.title = title
  }, [title])
  return (
    <Helmet>
      <title>{title}</title>
    </Helmet>
  )
}

export function RouteDocumentTitle() {
  const { pathname } = useLocation()
  const crumbs = useCrumbs()
  return <DocumentTitle key={pathname} segments={titleSegmentsFromCrumbs(crumbs)} />
}
