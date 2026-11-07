const BLOCKED_PREFIXES = ['/login', '/forgot-password', '/reset-password', '/change-password']

export function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  const path = value.split(/[?#]/)[0] ?? value
  if (BLOCKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return null
  return value
}

export function loginPath(next: string) {
  if (!next || next === '/') return '/login'
  return `/login?next=${encodeURIComponent(next)}`
}
