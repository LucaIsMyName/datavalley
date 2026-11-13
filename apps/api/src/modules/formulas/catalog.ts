import { eq, inArray } from 'drizzle-orm'
import type { BracketCatalog } from '@datavalley/formula-engine'
import type { Grant } from '@datavalley/shared'
import type { AppDatabase } from '../../database/client.js'
import { projects, relations, tables } from '../../database/schema.js'
import { allows, resolveGrants } from '../../security/access.js'
import type { Subject } from '../../security/subject.js'
import { loadColumns, resolveTableContext } from '../tables/service.js'

export type ProjectCatalogColumn = {
  tableId: string
  tableName: string
  columnId: string
  columnName: string
  projectId: string
}

type CatalogRelation = {
  columnId: string
  name: string
  toTableId: string
  toTableName: string
  toProjectId: string
  fields: { id: string; name: string }[]
}

type CatalogSource = {
  shellId: string
  projectName: string
  columns: ProjectCatalogColumn[]
  relations: CatalogRelation[]
}

/**
 * A mirror stores no columns of its own. Callers keep the mirror's id and name, and read
 * columns from the source table, which is what formula compile already does.
 */
export async function loadProjectCatalogColumns(
  db: AppDatabase,
  subject: Subject,
  projectId: string,
  grants: Grant[],
) {
  const columns: ProjectCatalogColumn[] = []
  const projectTables = await db.select().from(tables).where(eq(tables.projectId, projectId))
  for (const item of projectTables) {
    if (!allows(subject, grants, 'view', { type: 'table', id: item.id, parents: { project: item.projectId } })) continue
    const dataTableId = item.mirrorOfTableId ?? item.id
    for (const column of await loadColumns(db, dataTableId)) {
      columns.push({
        tableId: item.id,
        tableName: item.name,
        columnId: column.id,
        columnName: column.name,
        projectId: item.projectId,
      })
    }
  }
  return columns
}

async function loadFormulaCatalogSource(db: AppDatabase, subject: Subject, tableId: string): Promise<CatalogSource> {
  const { shell, physical } = await resolveTableContext(db, subject, tableId, 'view')
  const grants = await resolveGrants(db, subject)
  const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, shell.projectId)).limit(1)
  const columns = await loadProjectCatalogColumns(db, subject, shell.projectId, grants)
  const links: CatalogRelation[] = []
  for (const column of await loadColumns(db, physical.id)) {
    if (column.type !== 'relation') continue
    const relationId = String(column.config.relationId ?? '')
    const [relation] = relationId ? await db.select().from(relations).where(eq(relations.id, relationId)).limit(1) : []
    if (!relation) continue
    const [target] = await db.select().from(tables).where(eq(tables.id, relation.toTableId)).limit(1)
    if (!target) continue
    if (!allows(subject, grants, 'view', { type: 'table', id: target.id, parents: { project: target.projectId } })) continue
    const fields = await loadColumns(db, target.mirrorOfTableId ?? target.id)
    links.push({
      columnId: column.id,
      name: column.name,
      toTableId: target.id,
      toTableName: target.name,
      toProjectId: target.projectId,
      fields: fields.map((field) => ({ id: field.id, name: field.name })),
    })
  }
  return { shellId: shell.id, projectName: project?.name ?? '', columns, relations: links }
}

export async function bracketCatalog(db: AppDatabase, subject: Subject, tableId: string): Promise<BracketCatalog> {
  const source = await loadFormulaCatalogSource(db, subject, tableId)
  const columns: BracketCatalog['columns'] = source.columns.map((column) => ({
    name: column.columnName,
    columnId: column.columnId,
    tableId: column.tableId,
    tableName: column.tableName,
  }))
  for (const relation of source.relations) {
    for (const field of relation.fields) {
      if (!columns.some((item) => item.columnId === field.id)) {
        columns.push({
          name: field.name,
          columnId: field.id,
          tableId: relation.toTableId,
          tableName: relation.toTableName,
        })
      }
    }
  }
  return {
    tableId: source.shellId,
    columns,
    relations: source.relations.map((relation) => ({
      name: relation.name,
      columnId: relation.columnId,
      toTableId: relation.toTableId,
      toTableName: relation.toTableName,
      fields: relation.fields.map((field) => ({ name: field.name, columnId: field.id })),
    })),
    rows: [],
  }
}

export async function formulaCatalog(db: AppDatabase, subject: Subject, tableId: string) {
  const source = await loadFormulaCatalogSource(db, subject, tableId)
  const projectIds = [...new Set(source.relations.map((relation) => relation.toProjectId))]
  const named =
    projectIds.length > 0
      ? await db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, projectIds))
      : []
  const projectNames = new Map(named.map((project) => [project.id, project.name]))
  return {
    columns: source.columns.map((column) => ({
      tableId: column.tableId,
      tableName: column.tableName,
      columnId: column.columnId,
      columnName: column.columnName,
      projectName: source.projectName,
    })),
    relations: source.relations.map((relation) => ({
      columnId: relation.columnId,
      name: relation.name,
      toTableId: relation.toTableId,
      toTableName: relation.toTableName,
      toProjectName: projectNames.get(relation.toProjectId) ?? '',
      columns: relation.fields.map((field) => ({ id: field.id, name: field.name })),
    })),
  }
}
