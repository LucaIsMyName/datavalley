export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

export type RecentTitleHit = { title: string; subtitle?: string | null; resourceType: string }

export function recentTitleParts(hit: RecentTitleHit) {
  if (hit.resourceType === 'table' && hit.subtitle) {
    return { prefix: hit.subtitle, title: hit.title }
  }
  return { title: hit.title }
}
