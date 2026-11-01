import { appIntlLocale, formatDateValue } from '@datavalley/shared'

export function formatDateTime(iso: string, language?: string) {
  const locale = language ?? (typeof localStorage !== 'undefined' ? (localStorage.getItem('locale') ?? 'en') : 'en')
  return formatDateValue(iso, { kind: 'datetime', locale, timeZone: undefined })
}

export { appIntlLocale }

export type RecentTitleHit = { title: string; subtitle?: string | null; resourceType: string }

export function recentTitleParts(hit: RecentTitleHit) {
  if (hit.resourceType === 'table' && hit.subtitle) {
    return { prefix: hit.subtitle, title: hit.title }
  }
  return { title: hit.title }
}
