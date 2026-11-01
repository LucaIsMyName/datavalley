import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { tables, userFavorites, userRecentItems } from '../../database/schema.js'
import { assertCan } from '../../security/access.js'
import type { Subject } from '../../security/subject.js'
import { listProjects } from '../projects/service.js'

export type SavedHit = {
  id?: string
  resourceType: string
  resourceId: string
  title: string
  subtitle?: string | null
  icon: string
  href: string
}

async function visibleResources(db: AppDatabase, subject: Subject) {
  const projects = await listProjects(db, subject, false)
  const projectById = new Map(projects.map((project) => [project.id, project]))
  const ids = projects.map((project) => project.id)
  const rows = ids.length === 0 ? [] : await db.select().from(tables).where(and(inArray(tables.projectId, ids), isNull(tables.archivedAt)))
  const tableById = new Map<string, (typeof rows)[number]>()
  for (const table of rows) {
    try {
      await assertCan(db, subject, 'view', { type: 'table', id: table.id, parents: { project: table.projectId } })
      tableById.set(table.id, table)
    } catch {
      // A table the user cannot view stays out of the list.
    }
  }
  return { projectById, tableById }
}

function presentHit(
  row: { id?: string; resourceType: string; resourceId: string },
  projectById: Map<string, { id: string; name: string; icon: string }>,
  tableById: Map<string, { id: string; projectId: string; name: string; icon: string }>,
): SavedHit | null {
  if (row.resourceType === 'project') {
    const project = projectById.get(row.resourceId)
    if (!project) return null
    return {
      id: row.id,
      resourceType: 'project',
      resourceId: project.id,
      title: project.name,
      icon: project.icon,
      href: `/projects/${project.id}`,
    }
  }
  if (row.resourceType === 'table') {
    const table = tableById.get(row.resourceId)
    if (!table) return null
    const project = projectById.get(table.projectId)
    return {
      id: row.id,
      resourceType: 'table',
      resourceId: table.id,
      title: table.name,
      subtitle: project?.name ?? null,
      icon: table.icon,
      href: `/projects/${table.projectId}/tables/${table.id}`,
    }
  }
  return null
}

export async function listFavoriteHits(db: AppDatabase, subject: Subject) {
  const saved = await db.select().from(userFavorites).where(eq(userFavorites.userId, subject.id))
  const { projectById, tableById } = await visibleResources(db, subject)
  return saved.flatMap((row) => {
    const hit = presentHit(row, projectById, tableById)
    return hit ? [hit] : []
  })
}

export async function listRecentHits(db: AppDatabase, subject: Subject) {
  const saved = await db
    .select()
    .from(userRecentItems)
    .where(eq(userRecentItems.userId, subject.id))
    .orderBy(desc(userRecentItems.openedAt))
    .limit(20)
  const { projectById, tableById } = await visibleResources(db, subject)
  return saved.flatMap((row) => {
    const hit = presentHit(row, projectById, tableById)
    return hit ? [hit] : []
  })
}
