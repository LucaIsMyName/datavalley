import {
  MAX_AUTOMATION_FLOWS,
  MAX_AUTOMATION_RULES,
  effectiveAutomationRules,
  effectiveFlows,
  parseAutomationFlow,
  parseAutomationRule,
  validateFlow,
  withBuiltin,
  type AutomationFlow,
  type AutomationRule,
} from '@datavalley/shared'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { projects, tableColumns, tableStatuses, tableTags, tables } from '../../database/schema.js'
import { badRequest, notFound } from '../../errors.js'
import { allows, assertCan, resolveGrants } from '../../security/access.js'
import type { Subject } from '../../security/subject.js'
import { loadColumns } from '../tables/service.js'

export type AutomationTable = {
  id: string
  name: string
  columns: { id: string; name: string; type: string; toTableId: string | null; choices: { id: string; label: string }[] }[]
}

export async function listAutomations(db: AppDatabase, subject: Subject, projectId: string) {
  const project = await requireProject(db, subject, projectId)
  const grants = await resolveGrants(db, subject)
  return {
    rules: effectiveAutomationRules(project.settings),
    flows: effectiveFlows(project.settings),
    canEdit: allows(subject, grants, 'manage_structure', { type: 'project', id: projectId }),
    tables: await automationTables(db, projectId),
  }
}

export async function saveAutomations(db: AppDatabase, subject: Subject, projectId: string, body: unknown) {
  await assertCan(db, subject, 'manage_structure', { type: 'project', id: projectId })
  const project = await requireProject(db, subject, projectId)
  const rules = await acceptedRules(db, projectId, body)
  const catalog = await automationTables(db, projectId)
  const flows = acceptedFlows(body, catalog)
  const previousSettings = (project.settings ?? {}) as Record<string, unknown>
  const previous =
    previousSettings.automations && typeof previousSettings.automations === 'object' && !Array.isArray(previousSettings.automations)
      ? (previousSettings.automations as Record<string, unknown>)
      : {}
  const automations: Record<string, unknown> = { ...previous, rules }
  if (flows) automations.flows = flows
  const settings = { ...previousSettings, automations }
  await db.update(projects).set({ settings, updatedAt: new Date() }).where(eq(projects.id, projectId))
  const grants = await resolveGrants(db, subject)
  return {
    rules,
    flows: effectiveFlows(settings),
    canEdit: allows(subject, grants, 'manage_structure', { type: 'project', id: projectId }),
    tables: catalog,
  }
}

async function requireProject(db: AppDatabase, subject: Subject, projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!project) throw notFound()
  await assertCan(db, subject, 'view', { type: 'project', id: projectId })
  return project
}

async function acceptedRules(db: AppDatabase, projectId: string, body: unknown) {
  const rules = (body as { rules?: unknown } | null)?.rules
  if (!Array.isArray(rules)) throw badRequest('Rules are required')
  const parsed: AutomationRule[] = []
  for (const item of rules) {
    const rule = parseAutomationRule(item)
    if (!rule) throw badRequest('Invalid rule')
    parsed.push(rule)
  }
  const custom = parsed.filter((rule) => !rule.builtin)
  if (custom.length > MAX_AUTOMATION_RULES) throw badRequest('Too many rules')
  if (new Set(custom.map((rule) => rule.id)).size !== custom.length) throw badRequest('Duplicate rule')
  const stored = withBuiltin(parsed)
  const projectTables = await db.select({ id: tables.id }).from(tables).where(eq(tables.projectId, projectId))
  const tableIds = new Set(projectTables.map((table) => table.id))
  const columnRows = tableIds.size
    ? await db
        .select({ id: tableColumns.id, tableId: tableColumns.tableId, type: tableColumns.type })
        .from(tableColumns)
        .where(inArray(tableColumns.tableId, [...tableIds]))
    : []
  const columns = new Map(columnRows.map((column) => [column.id, column]))
  for (const rule of stored) {
    if (rule.builtin) continue
    if (!tableIds.has(rule.sourceTableId) || !tableIds.has(rule.targetTableId)) throw badRequest('Unknown table')
    const source = columns.get(rule.sourceColumnId)
    if (!source || source.tableId !== rule.sourceTableId) throw badRequest('Unknown column')
    if (rule.cells.length === 0) throw badRequest('A rule needs a cell template')
    for (const cell of rule.cells) {
      const column = columns.get(cell.columnId)
      if (!column || column.tableId !== rule.targetTableId) throw badRequest('Unknown column')
    }
    if (rule.linkColumnId) {
      const link = columns.get(rule.linkColumnId)
      if (!link || link.tableId !== rule.targetTableId || link.type !== 'relation') throw badRequest('Unknown link column')
    }
  }
  return stored
}

function acceptedFlows(body: unknown, tables: AutomationTable[]) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('flows' in body)) return undefined
  const flows = (body as { flows?: unknown }).flows
  if (!Array.isArray(flows)) throw badRequest('Invalid flow')
  if (flows.length > MAX_AUTOMATION_FLOWS) throw badRequest('Too many flows')
  const parsed: AutomationFlow[] = []
  for (const item of flows) {
    const flow = parseAutomationFlow(item)
    if (!flow) throw badRequest('Invalid flow')
    parsed.push(flow)
  }
  if (new Set(parsed.map((flow) => flow.id)).size !== parsed.length) throw badRequest('Duplicate flow')
  for (const flow of parsed) {
    if (!flow.enabled) continue
    const issues = validateFlow(flow, tables)
    if (issues.length > 0) throw badRequest(`Flow has problems: ${issues.map((issue) => issue.code).join(', ')}`)
  }
  return parsed
}

async function automationTables(db: AppDatabase, projectId: string): Promise<AutomationTable[]> {
  const rows = await db
    .select()
    .from(tables)
    .where(and(eq(tables.projectId, projectId), isNull(tables.archivedAt), isNull(tables.mirrorOfTableId)))
    .orderBy(asc(tables.position))
  const listed: AutomationTable[] = []
  for (const table of rows) {
    const columns = await loadColumns(db, table.id)
    const statuses = await db
      .select()
      .from(tableStatuses)
      .where(eq(tableStatuses.tableId, table.id))
      .orderBy(asc(tableStatuses.position))
    const tags = await db.select().from(tableTags).where(eq(tableTags.tableId, table.id)).orderBy(asc(tableTags.name))
    listed.push({
      id: table.id,
      name: table.name,
      columns: columns.map((column) => ({
        id: column.id,
        name: column.name,
        type: column.type,
        toTableId: typeof column.config.toTableId === 'string' ? column.config.toTableId : null,
        choices:
          column.type === 'status'
            ? statuses.map((status) => ({ id: status.id, label: status.name }))
            : column.type === 'tags'
              ? tags.map((tag) => ({ id: tag.id, label: tag.name }))
              : (column.options ?? []).map((option) => ({ id: option.id, label: option.label })),
      })),
    })
  }
  return listed
}
