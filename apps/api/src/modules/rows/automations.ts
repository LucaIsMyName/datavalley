import {
  conditionMatches,
  effectiveAutomationRules,
  effectiveFlows,
  fillAutomationTemplate,
  switchBranch,
  type AutomationFlow,
  type FlowActionNode,
  type FlowEdge,
  type FlowField,
} from '@datavalley/shared'
import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { projects, relationRecords, tableCells, tableRows, tableStatuses, tableTags } from '../../database/schema.js'
import { readCell } from '../../column-types/index.js'
import { AppError } from '../../errors.js'
import type { Subject } from '../../security/subject.js'
import { loadColumns, type LoadedColumn } from '../tables/service.js'
import { createStageFollowUps } from './stage-task.js'

type StageChange = { rowId: string; columnId: string; before: unknown; after: unknown }
export type AutomationEvent = 'row_created' | 'column_changed' | 'row_deleted'

type Hooks = {
  create: (tableId: string, cells: Record<string, unknown>) => Promise<unknown>
  update: (tableId: string, rowId: string, cells: Record<string, unknown>) => Promise<unknown>
}

type Walk = {
  tableId: string
  rowId: string
  current: Record<string, unknown>
  before: Record<string, unknown>
  createdRowId: string | null
  vars: Record<string, string>
}

export async function runProjectAutomations(
  db: AppDatabase,
  subject: Subject,
  table: { id: string; name: string; projectId: string },
  columns: LoadedColumn[],
  changes: StageChange[],
  hooks: Hooks,
  event: AutomationEvent = 'column_changed',
) {
  const moved = changes.filter((change) => JSON.stringify(change.before ?? null) !== JSON.stringify(change.after ?? null))
  const relevant = event === 'column_changed' ? moved : changes
  if (relevant.length === 0) return
  const [project] = await db
    .select({ settings: projects.settings })
    .from(projects)
    .where(eq(projects.id, table.projectId))
    .limit(1)
  const rules = effectiveAutomationRules(project?.settings).filter((rule) => rule.enabled)
  if (event === 'column_changed' && rules.some((rule) => rule.builtin)) {
    await createStageFollowUps(db, subject, table, columns, moved, hooks.create)
  }
  const flows = effectiveFlows(project?.settings).filter((flow) => flow.enabled)
  if (flows.length === 0) return
  const labels = await nameLabels(db, table.id)
  const today = new Date().toISOString().slice(0, 10)
  for (const rowId of [...new Set(relevant.map((change) => change.rowId))]) {
    const rowChanges = relevant.filter((change) => change.rowId === rowId)
    const current = await readRow(db, columns, rowId)
    const before = { ...current }
    for (const change of rowChanges) before[change.columnId] = change.before
    for (const flow of flows) {
      const trigger = flow.nodes.find((node) => node.type === 'trigger')
      if (!trigger || trigger.tableId !== table.id || trigger.event !== event) continue
      if (event === 'column_changed' && !rowChanges.some((change) => change.columnId === trigger.columnId)) continue
      const source = columns.find((column) => column.id === trigger.columnId)
      const shown = trigger.columnId ? current[trigger.columnId] : ''
      await walkFlow(db, columns, flow, hooks, {
        tableId: table.id,
        rowId,
        current,
        before,
        createdRowId: null,
        vars: { label: labelFor(source, shown, labels), value: plain(shown), today, row: rowId },
      })
    }
  }
}

async function walkFlow(db: AppDatabase, columns: LoadedColumn[], flow: AutomationFlow, hooks: Hooks, ctx: Walk) {
  const trigger = flow.nodes.find((node) => node.type === 'trigger')
  if (!trigger) return
  for (const edge of flow.edges.filter((item) => item.source === trigger.id && item.when == null)) {
    await walk(db, columns, flow, edge.target, hooks, { ...ctx, createdRowId: null }, [trigger.id])
  }
}

async function walk(
  db: AppDatabase,
  columns: LoadedColumn[],
  flow: AutomationFlow,
  nodeId: string,
  hooks: Hooks,
  ctx: Walk,
  stack: string[],
) {
  if (stack.includes(nodeId) || stack.length > 40) return
  const node = flow.nodes.find((item) => item.id === nodeId)
  if (!node) return
  const nextStack = [...stack, nodeId]
  if (node.type === 'condition') {
    const column = columns.find((item) => item.id === node.columnId)
    const yes = column
      ? conditionMatches(node.op, column.type, node.value, ctx.current[node.columnId], ctx.before[node.columnId], ctx.vars.today)
      : false
    for (const edge of matching(flow.edges, nodeId, yes ? 'yes' : 'no')) {
      await walk(db, columns, flow, edge.target, hooks, ctx, nextStack)
    }
    return
  }
  if (node.type === 'switch') {
    const branch = switchBranch(node.cases, ctx.current[node.columnId])
    for (const edge of matching(flow.edges, nodeId, branch)) {
      await walk(db, columns, flow, edge.target, hooks, ctx, nextStack)
    }
    return
  }
  if (node.type !== 'action') return
  const created = await runAction(db, node, hooks, ctx)
  const next = { ...ctx, createdRowId: created ?? ctx.createdRowId }
  for (const edge of flow.edges.filter((item) => item.source === nodeId && item.when == null)) {
    await walk(db, columns, flow, edge.target, hooks, next, nextStack)
  }
}

function matching(edges: FlowEdge[], source: string, when: string) {
  return edges.filter((edge) => edge.source === source && edge.when === when)
}

async function runAction(db: AppDatabase, node: FlowActionNode, hooks: Hooks, ctx: Walk) {
  const targetId = node.action === 'update_source' ? ctx.tableId : node.tableId
  const targetColumns = await loadColumns(db, targetId)
  const cells: Record<string, unknown> = {}
  for (const field of node.fields) {
    const column = targetColumns.find((item) => item.id === field.columnId)
    if (!column) continue
    const rendered = resolveField(column, field, ctx)
    if (rendered === undefined) continue
    cells[column.id] = rendered
  }
  if (Object.keys(cells).length === 0) return node.action === 'update_created' ? ctx.createdRowId : null
  try {
    if (node.action === 'create') return createdId(await hooks.create(targetId, cells))
    if (node.action === 'update_source') {
      await hooks.update(ctx.tableId, ctx.rowId, cells)
      return null
    }
    if (node.action === 'update_created') {
      if (!ctx.createdRowId) return null
      await hooks.update(targetId, ctx.createdRowId, cells)
      return ctx.createdRowId
    }
    const link = node.linkColumnId ? targetColumns.find((column) => column.id === node.linkColumnId) : undefined
    if (link) {
      const existing = await linkedRow(db, link, ctx.rowId, targetId)
      if (existing) {
        await hooks.update(targetId, existing, cells)
        return existing
      }
    }
    return createdId(await hooks.create(targetId, cells))
  } catch (error) {
    if (error instanceof AppError && error.status < 500) return null
    throw error
  }
}

function resolveField(column: LoadedColumn, field: FlowField, ctx: Walk) {
  if (field.value.kind === 'empty') return null
  if (field.value.kind === 'literal') return field.value.value
  if (field.value.kind === 'column') {
    const raw = ctx.current[field.value.columnId]
    if (raw == null || raw === '') return undefined
    if (column.type === 'text' || column.type === 'long_text' || column.type === 'mail' || column.type === 'url') {
      const text = plain(raw)
      return text || undefined
    }
    return raw
  }
  return renderCell(column, field.value.template, ctx.vars, ctx.rowId)
}

function renderCell(column: LoadedColumn, template: string, vars: Record<string, string>, sourceRowId: string) {
  const rendered = fillAutomationTemplate(template, vars).trim()
  if (column.type === 'checkbox') return ['true', '1', 'yes'].includes(rendered.toLowerCase())
  if (column.type === 'number' || column.type === 'currency') {
    if (!rendered) return undefined
    const amount = Number(rendered)
    return Number.isFinite(amount) ? amount : undefined
  }
  if (!rendered) return undefined
  if (column.type === 'relation') return rendered || sourceRowId
  if (column.type === 'select' || column.type === 'radio') {
    return column.options?.find((option) => option.id === rendered || option.label === rendered)?.id ?? rendered
  }
  return rendered
}

async function linkedRow(db: AppDatabase, column: LoadedColumn, sourceRowId: string, targetTableId: string) {
  const relationId = typeof column.config.relationId === 'string' ? column.config.relationId : ''
  if (!relationId) return null
  const [hit] = await db
    .select({ id: tableRows.id })
    .from(relationRecords)
    .innerJoin(tableRows, eq(tableRows.id, relationRecords.fromRowId))
    .where(
      and(
        eq(relationRecords.relationId, relationId),
        eq(relationRecords.toRowId, sourceRowId),
        eq(tableRows.tableId, targetTableId),
      ),
    )
    .limit(1)
  return hit?.id ?? null
}

async function readRow(db: AppDatabase, columns: LoadedColumn[], rowId: string) {
  const cells = await db.select().from(tableCells).where(eq(tableCells.rowId, rowId))
  const current: Record<string, unknown> = {}
  for (const column of columns) {
    const cell = cells.find((item) => item.columnId === column.id)
    current[column.id] = readCell(
      column,
      cell
        ? {
            valueText: cell.valueText,
            valueNumber: cell.valueNumber,
            valueBool: cell.valueBool,
            valueTimestamptz: cell.valueTimestamptz,
            valueJsonb: cell.valueJsonb,
          }
        : undefined,
    )
  }
  return current
}

async function nameLabels(db: AppDatabase, tableId: string) {
  const labels = new Map<string, string>()
  const statuses = await db
    .select({ id: tableStatuses.id, name: tableStatuses.name })
    .from(tableStatuses)
    .where(eq(tableStatuses.tableId, tableId))
  for (const status of statuses) labels.set(status.id, status.name)
  const tags = await db.select({ id: tableTags.id, name: tableTags.name }).from(tableTags).where(eq(tableTags.tableId, tableId))
  for (const tag of tags) labels.set(tag.id, tag.name)
  return labels
}

function labelFor(column: LoadedColumn | undefined, value: unknown, labels: Map<string, string>) {
  const text = plain(value)
  const option = column?.options?.find((item) => item.id === text)?.label?.trim()
  return option || labels.get(text) || text
}

function plain(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => plain(item)).filter(Boolean).join(', ')
  return ''
}

function createdId(value: unknown) {
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') return value.id
  return null
}
