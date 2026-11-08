import { fillAutomationTemplate, effectiveAutomationRules, type CustomAutomationRule } from '@datavalley/shared'
import { and, eq } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { projects, relationRecords, tableRows } from '../../database/schema.js'
import { AppError } from '../../errors.js'
import type { Subject } from '../../security/subject.js'
import { loadColumns, type LoadedColumn } from '../tables/service.js'
import { createStageFollowUps } from './stage-task.js'

type StageChange = { rowId: string; columnId: string; before: unknown; after: unknown }

export async function runProjectAutomations(
  db: AppDatabase,
  subject: Subject,
  table: { id: string; name: string; projectId: string },
  columns: LoadedColumn[],
  changes: StageChange[],
  hooks: {
    create: (tableId: string, cells: Record<string, unknown>) => Promise<unknown>
    update: (tableId: string, rowId: string, cells: Record<string, unknown>) => Promise<unknown>
  },
) {
  const moved = changes.filter((change) => JSON.stringify(change.before ?? null) !== JSON.stringify(change.after ?? null))
  if (moved.length === 0) return
  const [project] = await db
    .select({ settings: projects.settings })
    .from(projects)
    .where(eq(projects.id, table.projectId))
    .limit(1)
  const rules = effectiveAutomationRules(project?.settings).filter((rule) => rule.enabled)
  if (rules.some((rule) => rule.builtin)) {
    await createStageFollowUps(db, subject, table, columns, moved, hooks.create)
  }
  for (const rule of rules) {
    if (rule.builtin || rule.sourceTableId !== table.id) continue
    const relevant = moved.filter((change) => change.columnId === rule.sourceColumnId)
    if (relevant.length === 0) continue
    await applyCustomRule(db, columns, rule, relevant, hooks)
  }
}

async function applyCustomRule(
  db: AppDatabase,
  sourceColumns: LoadedColumn[],
  rule: CustomAutomationRule,
  changes: StageChange[],
  hooks: {
    create: (tableId: string, cells: Record<string, unknown>) => Promise<unknown>
    update: (tableId: string, rowId: string, cells: Record<string, unknown>) => Promise<unknown>
  },
) {
  const targetColumns = await loadColumns(db, rule.targetTableId)
  const link = rule.linkColumnId ? targetColumns.find((column) => column.id === rule.linkColumnId) : undefined
  const today = new Date().toISOString().slice(0, 10)
  for (const change of changes) {
    const source = sourceColumns.find((column) => column.id === change.columnId)
    const value = plain(change.after)
    const label = source?.options?.find((option) => option.id === value)?.label?.trim() || value
    const vars = { label, value, today, row: change.rowId }
    const cells: Record<string, unknown> = {}
    for (const cell of rule.cells) {
      const column = targetColumns.find((item) => item.id === cell.columnId)
      if (!column) continue
      const rendered = renderCell(column, cell.template, vars, change.rowId)
      if (rendered === undefined) continue
      cells[column.id] = rendered
    }
    if (Object.keys(cells).length === 0) continue
    try {
      if (rule.action === 'update' && link) {
        const existing = await linkedRow(db, link, change.rowId, rule.targetTableId)
        if (existing) {
          await hooks.update(rule.targetTableId, existing, cells)
          continue
        }
      }
      await hooks.create(rule.targetTableId, cells)
    } catch (error) {
      if (error instanceof AppError && error.status < 500) continue
      throw error
    }
  }
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

function plain(value: unknown) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}
