export type TocItem = { id: string; title: string }

export const DOC_GUIDES = [
  { to: '/doc/use', key: 'use' },
  { to: '/doc/develop', key: 'develop' },
  { to: '/doc/api', key: 'api' },
] as const

export function headingId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function docsHash(id: string) {
  return `#${id}`
}

export function hashHeadingId(hash: string) {
  return hash.replace(/^#/, '')
}

export function scrollToHeading(id: string) {
  const node = document.getElementById(id)
  if (!node) return false
  node.scrollIntoView({ block: 'start' })
  history.replaceState(null, '', docsHash(id))
  return true
}
