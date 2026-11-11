import { and, eq, inArray } from 'drizzle-orm'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { dataConnectors, fieldHistory, tableCells, tableColumns, tableConnectorBindings, users } from '../../database/schema.js'
import { sendMail } from '../../mail/smtp.js'
import type { Subject } from '../../security/subject.js'
import { notify } from '../platform/service.js'

type Notice = {
  type: string
  title: string
  body: string
  metadata: Record<string, unknown>
}

export function userIdsFromCell(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  if (!value || typeof value !== 'object' || !Array.isArray((value as { userIds?: unknown }).userIds)) return []
  return (value as { userIds: unknown[] }).userIds.filter((item): item is string => typeof item === 'string' && item.length > 0)
}

export async function readPreviousUserIds(db: AppDatabase, pairs: { rowId: string; columnId: string }[]) {
  const previous = new Map<string, string[]>()
  if (pairs.length === 0) return previous
  const cells = await db
    .select({ rowId: tableCells.rowId, columnId: tableCells.columnId, valueJsonb: tableCells.valueJsonb })
    .from(tableCells)
    .where(
      and(
        inArray(tableCells.rowId, [...new Set(pairs.map((pair) => pair.rowId))]),
        inArray(tableCells.columnId, [...new Set(pairs.map((pair) => pair.columnId))]),
      ),
    )
  for (const cell of cells) previous.set(`${cell.rowId}:${cell.columnId}`, userIdsFromCell(cell.valueJsonb))
  return previous
}

export function recordTitle(
  columns: { id: string; type: string; name: string }[],
  cells: { rowId: string; columnId: string; valueText: string | null }[],
  rowId: string,
) {
  const titled = columns.filter((column) => column.type === 'text' || column.type === 'mail' || column.type === 'url')
  const column = titled.find((item) => item.name.trim().toLowerCase() === 'name') ?? titled[0]
  if (!column) return ''
  return cells.find((cell) => cell.rowId === rowId && cell.columnId === column.id)?.valueText?.trim() ?? ''
}

export function titleFromInput(columns: { id: string; type: string; name: string }[], cells: Record<string, unknown>) {
  const titled = columns.filter((column) => column.type === 'text' || column.type === 'mail' || column.type === 'url')
  const column = titled.find((item) => item.name.trim().toLowerCase() === 'name') ?? titled[0]
  if (!column) return ''
  const value = cells[column.id]
  return typeof value === 'string' ? value.trim() : ''
}

export async function recordAutomationFailure(
  db: AppDatabase,
  subject: Subject,
  table: { id: string; name: string; projectId: string },
  rowId: string,
  columnId: string | null,
  message: string,
) {
  const text = message.slice(0, 500)
  if (columnId) {
    const [column] = await db.select({ id: tableColumns.id }).from(tableColumns).where(eq(tableColumns.id, columnId)).limit(1)
    if (column) {
      await db.insert(fieldHistory).values({
        tableId: table.id,
        rowId,
        columnId,
        actorId: subject.kind === 'user' ? subject.id : null,
        beforeText: '',
        afterText: text,
      })
    }
  }
  if (subject.kind !== 'user') return
  await notify(db, subject.id, {
    type: 'automation.failed',
    title: `Automation failed: ${table.name}`,
    body: text,
    metadata: { href: `/projects/${table.projectId}/tables/${table.id}/rows/${rowId}` },
  })
}

export async function announceAssignments(
  db: AppDatabase,
  env: Env | undefined,
  subject: Subject,
  table: { id: string; name: string; projectId: string },
  rowId: string,
  columns: { id: string; type: string }[],
  cells: Record<string, unknown>,
  previous: Map<string, string[]>,
  title: string,
) {
  const added = new Set<string>()
  for (const [columnId, value] of Object.entries(cells)) {
    const column = columns.find((item) => item.id === columnId)
    if (!column || column.type !== 'user') continue
    const before = new Set(previous.get(`${rowId}:${columnId}`) ?? [])
    for (const userId of userIdsFromCell(value)) {
      if (!before.has(userId) && userId !== subject.id) added.add(userId)
    }
  }
  if (added.size === 0) return
  const label = title.trim() || table.name
  const href = `/projects/${table.projectId}/tables/${table.id}/rows/${rowId}`
  for (const userId of added) {
    await deliverNotice(db, env, userId, {
      type: 'assignment',
      title: `Assigned: ${label}`,
      body: table.name,
      metadata: { href, projectId: table.projectId, tableId: table.id, rowId },
    })
  }
}

export async function notifySyncFailure(
  db: AppDatabase,
  env: Env,
  input: { connectorId: string; tableId?: string; actorUserId?: string; message: string },
) {
  const [connector] = await db.select().from(dataConnectors).where(eq(dataConnectors.id, input.connectorId)).limit(1)
  if (!connector) return
  const filters = [eq(tableConnectorBindings.connectorId, connector.id)]
  if (input.tableId) filters.push(eq(tableConnectorBindings.tableId, input.tableId))
  await db
    .update(tableConnectorBindings)
    .set({
      lastSyncAt: new Date(),
      lastSyncStatus: 'failed',
      lastError: input.message.slice(0, 2000),
      updatedAt: new Date(),
    })
    .where(and(...filters))
  const recipients = [...new Set([connector.createdBy, input.actorUserId].filter((id): id is string => Boolean(id)))]
  for (const userId of recipients) {
    await deliverNotice(db, env, userId, {
      type: 'connector.sync_failed',
      title: `Sync failed: ${connector.name}`,
      body: input.message,
      metadata: { href: '/integrations', connectorId: connector.id },
    })
  }
}

async function deliverNotice(db: AppDatabase, env: Env | undefined, userId: string, notice: Notice) {
  await notify(db, userId, notice)
  if (!env) return
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1)
  if (!user?.email) return
  const href = typeof notice.metadata.href === 'string' ? notice.metadata.href : ''
  try {
    await sendMail(env, {
      to: user.email,
      subject: notice.title,
      text: href ? `${notice.body}\n${href}` : notice.body,
    })
  } catch {
    // The in-app notice is already stored. Mail delivery stays best-effort.
  }
}
