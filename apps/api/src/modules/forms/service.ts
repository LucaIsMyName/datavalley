import { and, eq, lt, or, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { publicForms, tables, users } from '../../database/schema.js'
import { AppError, badRequest, notFound } from '../../errors.js'
import { randomToken } from '../../security/crypto.js'
import { assertCan } from '../../security/access.js'
import type { Subject } from '../../security/subject.js'
import { createRow } from '../rows/service.js'
import { loadColumns, requireTable } from '../tables/service.js'

const publicTypes = new Set(['text', 'long_text', 'mail', 'url', 'number', 'date', 'checkbox', 'select'])

function columnIds(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

export async function savePublicForm(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  requested: string[],
  dailyLimit?: number,
) {
  const table = await requireTable(db, subject, tableId, 'share')
  const columns = await loadColumns(db, table.id)
  const allowed = new Set(columns.filter((column) => publicTypes.has(column.type)).map((column) => column.id))
  const ids = [...new Set(requested.filter((id) => allowed.has(id)))]
  if (ids.length === 0) throw badRequest('Choose at least one column')
  const [existing] = await db.select().from(publicForms).where(eq(publicForms.tableId, table.id)).limit(1)
  if (existing) {
    const [updated] = await db
      .update(publicForms)
      .set({ columnIds: ids, ...(dailyLimit ? { dailyLimit } : {}) })
      .where(eq(publicForms.id, existing.id))
      .returning()
    return presentForm(updated)
  }
  const [created] = await db
    .insert(publicForms)
    .values({
      tableId: table.id,
      token: randomToken(24),
      columnIds: ids,
      createdBy: subject.kind === 'user' ? subject.id : null,
      ...(dailyLimit ? { dailyLimit } : {}),
    })
    .returning()
  return presentForm(created)
}

export async function readPublicForm(db: AppDatabase, subject: Subject, tableId: string) {
  await requireTable(db, subject, tableId, 'share')
  const [form] = await db.select().from(publicForms).where(eq(publicForms.tableId, tableId)).limit(1)
  return { form: form ? presentForm(form) : null }
}

export async function deletePublicForm(db: AppDatabase, subject: Subject, tableId: string) {
  await requireTable(db, subject, tableId, 'share')
  await db.delete(publicForms).where(eq(publicForms.tableId, tableId))
}

function presentForm(form: { token: string; columnIds: unknown; dailyLimit: number }) {
  return { token: form.token, columnIds: columnIds(form.columnIds), dailyLimit: form.dailyLimit }
}

export async function publicFormFields(db: AppDatabase, token: string) {
  const form = await loadForm(db, token)
  const columns = await loadColumns(db, form.tableId)
  const ids = new Set(columnIds(form.columnIds))
  const fields = columns
    .filter((column) => ids.has(column.id))
    .map((column) => ({
      id: column.id,
      name: column.name,
      type: column.type,
      options: column.type === 'select' ? (column.options ?? []).map((option) => ({ id: option.id, label: option.label })) : [],
    }))
  return { tableName: form.tableName, fields }
}

/** Counts one submission against the form's rolling 24-hour limit. False when the limit is reached. */
async function claimSubmission(db: AppDatabase, formId: string) {
  const fresh = sql`(${publicForms.windowStartedAt} IS NULL OR ${publicForms.windowStartedAt} < now() - interval '1 day')`
  const claimed = await db
    .update(publicForms)
    .set({
      windowStartedAt: sql`CASE WHEN ${fresh} THEN now() ELSE ${publicForms.windowStartedAt} END`,
      windowCount: sql`CASE WHEN ${fresh} THEN 1 ELSE ${publicForms.windowCount} + 1 END`,
    })
    .where(and(eq(publicForms.id, formId), or(fresh, lt(publicForms.windowCount, publicForms.dailyLimit))))
    .returning({ id: publicForms.id })
  return claimed.length > 0
}

export async function submitPublicForm(
  db: AppDatabase,
  token: string,
  cells: Record<string, unknown>,
  honeypot = '',
) {
  // Real visitors never see the honeypot field, so a value there means an automated submission.
  if (honeypot.trim() !== '') throw badRequest('The form could not be sent')
  const form = await loadForm(db, token)
  if (!form.createdBy) throw notFound()
  const [owner] = await db.select().from(users).where(eq(users.id, form.createdBy)).limit(1)
  if (!owner || owner.disabledAt) throw notFound()
  const allowed = new Set(columnIds(form.columnIds))
  const input: Record<string, unknown> = {}
  for (const [columnId, value] of Object.entries(cells)) {
    if (!allowed.has(columnId) || value == null || value === '') continue
    input[columnId] = value
  }
  if (Object.keys(input).length === 0) throw badRequest('Fill in the form')
  if (!(await claimSubmission(db, form.id))) {
    throw new AppError(429, 'rate_limited', 'This form has received too many submissions today. Try again tomorrow.')
  }
  await assertCan(db, { kind: 'user', id: owner.id, role: owner.role === 'admin' ? 'admin' : 'user', source: 'web', user: owner }, 'edit', {
    type: 'table',
    id: form.tableId,
    parents: { project: form.projectId },
  })
  const row = await createRow(
    db,
    { kind: 'user', id: owner.id, role: owner.role === 'admin' ? 'admin' : 'user', source: 'web', user: owner },
    form.tableId,
    input,
    {},
    true,
  )
  return { id: row.id }
}

async function loadForm(db: AppDatabase, token: string) {
  const [form] = await db.select().from(publicForms).where(eq(publicForms.token, token)).limit(1)
  if (!form) throw notFound()
  const [stored] = await db.select().from(tables).where(eq(tables.id, form.tableId)).limit(1)
  if (!stored || stored.archivedAt) throw notFound()
  return { ...form, tableName: stored.name, projectId: stored.projectId }
}
