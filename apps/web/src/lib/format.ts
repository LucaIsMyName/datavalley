export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

export function formatRecentTitle(hit: { title: string; subtitle?: string | null; resourceType: string }) {
  if (hit.resourceType === 'table' && hit.subtitle) return `${hit.subtitle} > ${hit.title}`
  return hit.title
}
