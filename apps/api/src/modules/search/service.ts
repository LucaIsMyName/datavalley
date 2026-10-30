import { escapeLike } from '@datavalley/shared'
import { inArray, max, sql, type SQL } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { tableCells, tableColumns, tableRows, tables, userFavorites } from '../../database/schema.js'
import { allows, loadGrants } from '../../security/access.js'
import type { Subject } from '../../security/subject.js'
import { listPlugins } from '../platform/service.js'
import { listProjects } from '../projects/service.js'
import { listTables } from '../tables/service.js'

const LIMIT = 8
const MAX_QUERY = 80

export type SearchHit = {
  id: string
  title: string
  subtitle: string | null
  href: string
}

export type SearchResults = {
  projects: SearchHit[]
  tables: SearchHit[]
  columns: SearchHit[]
  rows: SearchHit[]
  routes: SearchHit[]
  favorites: SearchHit[]
  integrations: SearchHit[]
}

type Locale = 'en' | 'de'

type VisibleTable = {
  id: string
  projectId: string
  name: string
  projectName: string
  updatedAt: string
}

const pageRoutes: { id: string; href: string; admin: boolean; titles: Record<Locale, string> }[] = [
  { id: 'dashboard', href: '/', admin: false, titles: { en: 'Dashboard', de: 'Übersicht' } },
  { id: 'projects', href: '/projects', admin: false, titles: { en: 'Projects', de: 'Projekte' } },
  { id: 'recent', href: '/recent', admin: false, titles: { en: 'Recent', de: 'Zuletzt' } },
  { id: 'favorites', href: '/favorites', admin: false, titles: { en: 'Favorites', de: 'Favoriten' } },
  { id: 'docs', href: '/doc', admin: false, titles: { en: 'Docs', de: 'Dokumentation' } },
  { id: 'integrations', href: '/integrations', admin: false, titles: { en: 'Integrations', de: 'Integrationen' } },
  { id: 'profile', href: '/settings/profile', admin: false, titles: { en: 'Profile', de: 'Profil' } },
  { id: 'users', href: '/settings/users', admin: true, titles: { en: 'Users', de: 'Benutzer' } },
  { id: 'api-keys', href: '/settings/api-keys', admin: true, titles: { en: 'API keys', de: 'API-Schlüssel' } },
  { id: 'audit', href: '/settings/audit', admin: true, titles: { en: 'Audit log', de: 'Protokoll' } },
]

function emptyResults(): SearchResults {
  return { projects: [], tables: [], columns: [], rows: [], routes: [], favorites: [], integrations: [] }
}

function includes(query: string, ...parts: (string | null | undefined)[]) {
  const needle = query.toLowerCase()
  return parts.some((part) => (part ?? '').toLowerCase().includes(needle))
}

function clip(value: string) {
  const text = value.trim()
  if (text.length <= 80) return text
  return `${text.slice(0, 79)}…`
}

function cellTitle(text: string | null, numberText: string | null) {
  if (text?.trim()) return clip(text)
  if (!numberText) return null
  const trimmed = numberText.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  return trimmed ? clip(trimmed) : null
}

function timeOf(value: Date | string | null | undefined) {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

async function many<T extends Record<string, unknown>>(db: AppDatabase, query: SQL): Promise<T[]> {
  const result = await db.execute(query)
  if (Array.isArray(result)) return result as T[]
  return ((result as { rows?: T[] }).rows ?? []) as T[]
}

function routeHits(subject: Subject, query: string, locale: Locale): SearchHit[] {
  return pageRoutes
    .filter((route) => !route.admin || subject.role === 'admin')
    .filter((route) => !query || includes(query, route.titles[locale], route.href))
    .slice(0, LIMIT)
    .map((route) => ({ id: route.id, title: route.titles[locale], subtitle: null, href: route.href }))
}

async function visibleTables(db: AppDatabase, subject: Subject) {
  const projects = await listProjects(db, subject, false)
  const visible: VisibleTable[] = []
  for (const project of projects) {
    const rows = await listTables(db, subject, project.id)
    for (const table of rows) {
      visible.push({ id: table.id, projectId: project.id, name: table.name, projectName: project.name, updatedAt: table.updatedAt })
    }
  }
  return { projects, tables: visible }
}

async function latestTables(db: AppDatabase, tablesInScope: VisibleTable[]): Promise<SearchHit[]> {
  if (tablesInScope.length === 0) return []
  const stamps = await db
    .select({ tableId: tableRows.tableId, updatedAt: max(tableRows.updatedAt) })
    .from(tableRows)
    .where(inArray(tableRows.tableId, tablesInScope.map((table) => table.id)))
    .groupBy(tableRows.tableId)
  const latest = new Map(stamps.map((stamp) => [stamp.tableId, stamp.updatedAt]))
  return [...tablesInScope]
    .sort((a, b) => Math.max(timeOf(b.updatedAt), timeOf(latest.get(b.id))) - Math.max(timeOf(a.updatedAt), timeOf(latest.get(a.id))))
    .slice(0, LIMIT)
    .map((table) => ({
      id: table.id,
      title: table.name,
      subtitle: table.projectName,
      href: `/projects/${table.projectId}/tables/${table.id}`,
    }))
}

function tableHit(table: VisibleTable): SearchHit {
  return {
    id: table.id,
    title: table.name,
    subtitle: table.projectName,
    href: `/projects/${table.projectId}/tables/${table.id}`,
  }
}

async function columnHits(db: AppDatabase, subject: Subject, query: string, tablesInScope: VisibleTable[], grants: Awaited<ReturnType<typeof loadGrants>>) {
  if (!query || tablesInScope.length === 0) return []
  const byId = new Map(tablesInScope.map((table) => [table.id, table]))
  const columns = await db.select().from(tableColumns).where(inArray(tableColumns.tableId, [...byId.keys()]))
  const hits: SearchHit[] = []
  for (const column of columns) {
    if (!includes(query, column.name, column.description)) continue
    const table = byId.get(column.tableId)
    if (!table) continue
    if (!allows(subject, grants, 'view', { type: 'column', id: column.id, parents: { table: table.id, project: table.projectId } })) continue
    hits.push({
      id: column.id,
      title: column.name,
      subtitle: `${table.projectName} · ${table.name}`,
      href: `/projects/${table.projectId}/tables/${table.id}?column=${column.id}`,
    })
    if (hits.length === LIMIT) break
  }
  return hits
}

async function rowHits(db: AppDatabase, subject: Subject, query: string, tablesInScope: VisibleTable[], grants: Awaited<ReturnType<typeof loadGrants>>) {
  if (!query || tablesInScope.length === 0) return []
  const byId = new Map(tablesInScope.map((table) => [table.id, table]))
  const idList = sql.join([...byId.keys()].map((id) => sql`${id}`), sql`, `)
  const pattern = `%${escapeLike(query)}%`
  const matched = await many<{
    row_id: string
    table_id: string
    column_id: string
    column_name: string
    value_text: string | null
    value_number: string | null
  }>(
    db,
    sql`SELECT r.id AS row_id, t.id AS table_id, c.column_id AS column_id, col.name AS column_name,
        c.value_text AS value_text, c.value_number::text AS value_number
      FROM ${tableCells} c
      JOIN ${tableRows} r ON r.id = c.row_id
      JOIN ${tables} t ON t.id = r.table_id
      JOIN ${tableColumns} col ON col.id = c.column_id
      WHERE t.id IN (${idList})
        AND (
          c.value_text ILIKE ${pattern} ESCAPE '\\'
          OR c.value_number::text ILIKE ${pattern} ESCAPE '\\'
        )
      ORDER BY r.updated_at DESC
      LIMIT 80`,
  )
  const hits: SearchHit[] = []
  const seen = new Set<string>()
  for (const cell of matched) {
    if (seen.has(cell.row_id)) continue
    const table = byId.get(cell.table_id)
    if (!table) continue
    const parents = { table: table.id, project: table.projectId }
    if (!allows(subject, grants, 'view', { type: 'column', id: cell.column_id, parents })) continue
    if (!allows(subject, grants, 'view', { type: 'row', id: cell.row_id, parents })) continue
    const title = cellTitle(cell.value_text, cell.value_number)
    if (!title) continue
    seen.add(cell.row_id)
    hits.push({
      id: cell.row_id,
      title,
      subtitle: `${table.name} · ${cell.column_name}`,
      href: `/projects/${table.projectId}/tables/${table.id}?row=${cell.row_id}&column=${cell.column_id}`,
    })
    if (hits.length === LIMIT) break
  }
  return hits
}

async function favoriteHits(db: AppDatabase, subject: Subject, query: string, projects: { id: string; name: string }[], tablesInScope: VisibleTable[]) {
  if (!query || subject.kind !== 'user') return []
  const saved = await db.select().from(userFavorites).where(sql`${userFavorites.userId} = ${subject.id}`)
  const hits: SearchHit[] = []
  for (const favorite of saved) {
    if (favorite.resourceType === 'project') {
      const project = projects.find((item) => item.id === favorite.resourceId)
      if (!project || !includes(query, project.name)) continue
      hits.push({ id: `project:${project.id}`, title: project.name, subtitle: null, href: `/projects/${project.id}` })
    } else if (favorite.resourceType === 'table') {
      const table = tablesInScope.find((item) => item.id === favorite.resourceId)
      if (!table || !includes(query, table.name)) continue
      hits.push({
        id: `table:${table.id}`,
        title: table.name,
        subtitle: table.projectName,
        href: `/projects/${table.projectId}/tables/${table.id}`,
      })
    }
    if (hits.length === LIMIT) break
  }
  return hits
}

export async function search(db: AppDatabase, subject: Subject, input: { q?: string; locale?: string }): Promise<SearchResults> {
  const query = (input.q ?? '').trim().slice(0, MAX_QUERY)
  const locale: Locale = input.locale === 'de' ? 'de' : 'en'
  const results = emptyResults()
  results.routes = routeHits(subject, query, locale)
  const { projects, tables: tablesInScope } = await visibleTables(db, subject)
  if (!query) {
    results.tables = await latestTables(db, tablesInScope)
    return results
  }
  results.projects = projects
    .filter((project) => includes(query, project.name, project.description))
    .slice(0, LIMIT)
    .map((project) => ({ id: project.id, title: project.name, subtitle: project.description || null, href: `/projects/${project.id}` }))
  results.tables = tablesInScope.filter((table) => includes(query, table.name)).slice(0, LIMIT).map(tableHit)
  const grants = await loadGrants(db, subject)
  results.columns = await columnHits(db, subject, query, tablesInScope, grants)
  results.rows = await rowHits(db, subject, query, tablesInScope, grants)
  results.favorites = await favoriteHits(db, subject, query, projects, tablesInScope)
  const plugins = await listPlugins(db)
  results.integrations = plugins
    .filter((plugin) => includes(query, plugin.name))
    .slice(0, LIMIT)
    .map((plugin) => ({ id: plugin.id, title: plugin.name, subtitle: null, href: '/integrations' }))
  return results
}
