export type DuplicateKind = 'mail' | 'domain'

export function duplicateKind(column: { type: string; name: string }): DuplicateKind | null {
  if (column.type === 'mail') return 'mail'
  const name = column.name.trim().toLowerCase()
  if (column.type === 'url') return 'domain'
  if (column.type === 'text' && (name === 'domain' || name === 'website')) return 'domain'
  return null
}

export function duplicateKey(kind: DuplicateKind, value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null
  if (kind === 'mail') {
    const email = raw.toLowerCase()
    return email.includes('@') ? email : null
  }
  return domainHost(raw)
}

export function domainHost(value: string): string | null {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed || trimmed.includes('@') || /\s/.test(trimmed)) return null
  try {
    const host = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname.replace(/^www\./, '')
    return host.includes('.') ? host : null
  } catch {
    return null
  }
}
