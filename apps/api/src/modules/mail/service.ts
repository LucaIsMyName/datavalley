import { applyMailPlaceholders } from '@datavalley/shared'
import { and, desc, eq, inArray, or } from 'drizzle-orm'
import type { Env } from '../../config/env.js'
import { readCell } from '../../column-types/index.js'
import type { AppDatabase } from '../../database/client.js'
import { mailMessages, mailTemplates, projects, tableCells, tableRows, tables, users } from '../../database/schema.js'
import { AppError, badRequest, notFound } from '../../errors.js'
import { sendMail } from '../../mail/smtp.js'
import { assertCan } from '../../security/access.js'
import type { Subject } from '../../security/subject.js'
import { historyLabel } from '../rows/history.js'
import { rowDisplayTitle } from '../rows/titles.js'
import { visibleColumns } from '../rows/visible-columns.js'
import { loadColumns, requireEditableTable, resolveTableContext, type LoadedColumn } from '../tables/service.js'

const addressPattern = /^[^\s@]+@[^\s@]+$/

function organizationId(subject: Subject) {
  const id = subject.user?.organizationId
  if (!id) throw new AppError(403, 'forbidden', 'Sign in to use mail')
  return id
}

function requireAdmin(subject: Subject) {
  if (subject.role !== 'admin') throw new AppError(403, 'forbidden', 'Admin access is required')
  return organizationId(subject)
}

export async function listMailTemplates(db: AppDatabase, subject: Subject) {
  const orgId = organizationId(subject)
  return db
    .select({
      id: mailTemplates.id,
      name: mailTemplates.name,
      subject: mailTemplates.subject,
      body: mailTemplates.body,
    })
    .from(mailTemplates)
    .where(eq(mailTemplates.organizationId, orgId))
    .orderBy(mailTemplates.name)
}

export async function createMailTemplate(
  db: AppDatabase,
  subject: Subject,
  input: { name: string; subject: string; body: string },
) {
  const orgId = requireAdmin(subject)
  const name = input.name.trim()
  if (!name) throw badRequest('Name the template')
  const [created] = await db
    .insert(mailTemplates)
    .values({
      organizationId: orgId,
      name,
      subject: input.subject,
      body: input.body,
      createdBy: subject.kind === 'user' ? subject.id : null,
    })
    .returning({
      id: mailTemplates.id,
      name: mailTemplates.name,
      subject: mailTemplates.subject,
      body: mailTemplates.body,
    })
  return created
}

export async function updateMailTemplate(
  db: AppDatabase,
  subject: Subject,
  templateId: string,
  input: { name: string; subject: string; body: string },
) {
  const orgId = requireAdmin(subject)
  const name = input.name.trim()
  if (!name) throw badRequest('Name the template')
  const [updated] = await db
    .update(mailTemplates)
    .set({ name, subject: input.subject, body: input.body, updatedAt: new Date() })
    .where(and(eq(mailTemplates.id, templateId), eq(mailTemplates.organizationId, orgId)))
    .returning({
      id: mailTemplates.id,
      name: mailTemplates.name,
      subject: mailTemplates.subject,
      body: mailTemplates.body,
    })
  if (!updated) throw notFound()
  return updated
}

export async function deleteMailTemplate(db: AppDatabase, subject: Subject, templateId: string) {
  const orgId = requireAdmin(subject)
  const [removed] = await db
    .delete(mailTemplates)
    .where(and(eq(mailTemplates.id, templateId), eq(mailTemplates.organizationId, orgId)))
    .returning({ id: mailTemplates.id })
  if (!removed) throw notFound()
}

async function rowContext(db: AppDatabase, tableId: string, rowId: string) {
  const columns = await loadColumns(db, tableId)
  const cells = await db
    .select()
    .from(tableCells)
    .where(and(eq(tableCells.tableId, tableId), eq(tableCells.rowId, rowId)))
  const [table] = await db.select().from(tables).where(eq(tables.id, tableId)).limit(1)
  const values: Record<string, unknown> = {}
  for (const column of columns) {
    values[column.id] = readCell(column, cells.find((cell) => cell.columnId === column.id))
  }
  const userIds = columns.flatMap((column) => {
    if (column.type !== 'user') return []
    const value = values[column.id]
    return Array.isArray(value) ? value.map(String) : []
  })
  const people = userIds.length
    ? await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.id, userIds))
    : []
  const labels = new Map(people.map((person) => [person.id, person.username]))
  const mainColumnId = (table?.headerConfig as { mainColumnId?: string } | null)?.mainColumnId ?? null
  return { columns, values, labels, mainColumnId }
}

type RowContext = Awaited<ReturnType<typeof rowContext>>

async function visibleRow(db: AppDatabase, subject: Subject, tableId: string, rowId: string) {
  const { shell, physical } = await resolveTableContext(db, subject, tableId, 'view')
  await assertCan(db, subject, 'view', {
    type: 'row',
    id: rowId,
    parents: { table: shell.id, project: shell.projectId },
  })
  const context = await rowContext(db, physical.id, rowId)
  const columns = await visibleColumns(db, subject, shell.id, shell.projectId, context.columns)
  return { ...context, columns }
}

async function visibleRowIfAllowed(db: AppDatabase, subject: Subject, tableId: string, rowId: string) {
  try {
    return await visibleRow(db, subject, tableId, rowId)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) return null
    throw error
  }
}

async function rowFields(db: AppDatabase, subject: Subject, context: RowContext) {
  const fields: Record<string, string> = {}
  for (const column of context.columns) {
    if (column.type === 'relation') {
      const targetId = context.values[column.id]
      const toTableId = String(column.config.toTableId ?? '')
      if (typeof targetId !== 'string' || !targetId || !toTableId) continue
      const linked = await visibleRowIfAllowed(db, subject, toTableId, targetId)
      if (!linked) continue
      const title = rowDisplayTitle(linked.columns, linked.values, linked.labels, targetId, linked.mainColumnId)
      if (title) fields[column.name] = title
      continue
    }
    const label = historyLabel(column, context.values[column.id], context.labels).trim()
    if (label) fields[column.name] = label
  }
  return fields
}

function addressesOnRow(columns: LoadedColumn[], values: Record<string, unknown>, label: string, rowId: string) {
  const found: { address: string; label: string; rowId: string }[] = []
  for (const column of columns) {
    if (column.type !== 'mail') continue
    const value = values[column.id]
    if (typeof value !== 'string' || !addressPattern.test(value.trim())) continue
    found.push({ address: value.trim(), label: `${label} · ${column.name}`, rowId })
  }
  return found
}

async function loadRow(db: AppDatabase, rowId: string) {
  const [row] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
  if (!row) throw notFound()
  return row
}

export async function listRowMail(db: AppDatabase, subject: Subject, rowId: string) {
  const row = await loadRow(db, rowId)
  const current = await visibleRow(db, subject, row.tableId, row.id)
  const fields = await rowFields(db, subject, current)
  const title = rowDisplayTitle(current.columns, current.values, current.labels, row.id, current.mainColumnId)
  const recipients = addressesOnRow(current.columns, current.values, title || 'Record', row.id)
  const seen = new Set(recipients.map((item) => item.address.toLowerCase()))
  for (const column of current.columns) {
    if (column.type !== 'relation') continue
    const targetId = current.values[column.id]
    const toTableId = String(column.config.toTableId ?? '')
    if (typeof targetId !== 'string' || !targetId || !toTableId) continue
    const linked = await visibleRowIfAllowed(db, subject, toTableId, targetId)
    if (!linked) continue
    const linkedTitle =
      rowDisplayTitle(linked.columns, linked.values, linked.labels, targetId, linked.mainColumnId) || targetId
    const linkedAddresses = addressesOnRow(
      linked.columns,
      linked.values,
      `${column.name} · ${linkedTitle}`,
      targetId,
    )
    for (const item of linkedAddresses) {
      if (seen.has(item.address.toLowerCase())) continue
      seen.add(item.address.toLowerCase())
      recipients.push(item)
    }
  }
  const stored = await db
    .select({
      id: mailMessages.id,
      to: mailMessages.toAddress,
      subject: mailMessages.subject,
      body: mailMessages.body,
      actorName: users.username,
      createdAt: mailMessages.createdAt,
      rowId: mailMessages.rowId,
      relatedRowId: mailMessages.relatedRowId,
    })
    .from(mailMessages)
    .leftJoin(users, eq(users.id, mailMessages.actorId))
    .where(or(eq(mailMessages.rowId, row.id), eq(mailMessages.relatedRowId, row.id)))
    .orderBy(desc(mailMessages.createdAt))
    .limit(30)
  return {
    fields,
    recipients,
    messages: stored.map((message) => ({
      ...message,
      createdAt: message.createdAt.toISOString(),
    })),
  }
}

export async function sendRowMail(
  db: AppDatabase,
  env: Env,
  subject: Subject,
  rowId: string,
  input: { to: string; subject: string; body: string; templateId?: string | null },
) {
  const row = await loadRow(db, rowId)
  const table = await requireEditableTable(db, subject, row.tableId, 'edit')
  await assertCan(db, subject, 'edit', {
    type: 'row',
    id: row.id,
    parents: { table: table.id, project: table.projectId },
  })
  const [project] = await db.select().from(projects).where(eq(projects.id, table.projectId)).limit(1)
  if (!project) throw notFound()
  const orgId = organizationId(subject)
  if (project.organizationId !== orgId) throw notFound()
  const to = input.to.trim()
  if (!addressPattern.test(to)) throw badRequest('Enter an email address')
  const { fields, recipients } = await listRowMail(db, subject, row.id)
  const resolvedSubject = applyMailPlaceholders(input.subject, fields).trim()
  const resolvedBody = applyMailPlaceholders(input.body, fields)
  if (!resolvedSubject) throw badRequest('Add a subject')
  let templateId: string | null = null
  if (input.templateId) {
    const [template] = await db
      .select({ id: mailTemplates.id })
      .from(mailTemplates)
      .where(and(eq(mailTemplates.id, input.templateId), eq(mailTemplates.organizationId, orgId)))
      .limit(1)
    if (!template) throw badRequest('Choose a template from this organization')
    templateId = template.id
  }
  const related = recipients.find((item) => item.address.toLowerCase() === to.toLowerCase() && item.rowId !== row.id)
  await sendMail(env, { to, subject: resolvedSubject, text: resolvedBody })
  const [saved] = await db
    .insert(mailMessages)
    .values({
      organizationId: orgId,
      projectId: project.id,
      rowId: row.id,
      relatedRowId: related?.rowId ?? null,
      templateId,
      actorId: subject.kind === 'user' ? subject.id : null,
      toAddress: to,
      subject: resolvedSubject,
      body: resolvedBody,
    })
    .returning({
      id: mailMessages.id,
      to: mailMessages.toAddress,
      subject: mailMessages.subject,
      body: mailMessages.body,
      createdAt: mailMessages.createdAt,
      rowId: mailMessages.rowId,
      relatedRowId: mailMessages.relatedRowId,
    })
  return {
    message: {
      ...saved,
      actorName: subject.user?.username ?? null,
      createdAt: saved.createdAt.toISOString(),
    },
  }
}
