import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(import.meta.dirname, '..')
const spec = JSON.parse(
  readFileSync(join(root, 'packages/contracts/openapi.json'), 'utf8'),
) as { paths: Record<string, unknown> }

/** OpenAPI paths are mounted under /api/v1 in the app but stored without that prefix. */
const openapiPaths = new Set(
  Object.keys(spec.paths).map((path) => {
    const normalized = path.replace(/:([^/]+)/g, '{$1}')
    return normalized
  }),
)

const ALLOWLIST = new Set([
  '/auth/csrf',
  '/auth/login',
  '/auth/logout',
  '/auth/session',
  '/auth/me',
])

const REQUEST_PATH_RE = /request(?:<[^>]*>)?\(\s*`([^`]+)`/g
function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (name === 'node_modules' || name === 'dist' || name === 'e2e') continue
    const stat = statSync(path)
    if (stat.isDirectory()) walk(path, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(path)
  }
}

function collectClientPaths() {
  const files: string[] = []
  walk(join(root, 'packages/api-client/src'), files)
  walk(join(root, 'apps/web/src'), files)
  const paths = new Set<string>()
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
  REQUEST_PATH_RE.lastIndex = 0
    for (const match of source.matchAll(REQUEST_PATH_RE)) {
      const raw = match[1]
      if (raw.includes('${') && (raw.includes('?') || raw.includes(' ') || raw.includes(':'))) continue
      const withoutQuery = raw.split('?')[0] ?? raw
      const path = withoutQuery.replace(/\$\{[^}]+\}/g, '{id}').replace(/\/+/g, '/')
      let normalized = path.startsWith('/') ? path : `/${path}`
      if (normalized === '/media{id}') normalized = '/media'
      if ((normalized.match(/\{id\}/g) || []).length > 1) continue
      if (!/^\/[\w/{}-]+$/.test(normalized)) continue
      paths.add(normalized)
    }
  }
  return { paths, files: files.map((file) => relative(root, file)) }
}

describe('api client paths vs OpenAPI', () => {
  it('declared request paths exist in the contract', () => {
    const { paths } = collectClientPaths()
    const missing: string[] = []
    for (const path of paths) {
      if (ALLOWLIST.has(path)) continue
      const templated = path.replace(/\{id\}/g, '{param}')
      const candidates = [path, templated]
      const known = candidates.some((candidate) => {
        if (openapiPaths.has(candidate)) return true
        return [...openapiPaths].some(
          (entry) =>
            entry.replace(/\{[^}]+\}/g, '{id}') === path ||
            entry.replace(/\{[^}]+\}/g, '{param}') === templated,
        )
      })
      if (!known) missing.push(path)
    }
    expect(missing, `Unknown API paths (update client or OpenAPI): ${missing.join(', ')}`).toEqual([])
  })
})