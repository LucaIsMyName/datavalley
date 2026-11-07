import { eq } from 'drizzle-orm'
import type { RealtimeDraft, RealtimeRow } from '@datavalley/shared'
import type { AppDatabase } from '../../database/client.js'
import { tables } from '../../database/schema.js'
import { getRealtimeHub } from './hub.js'

export function publishRealtime(projectId: string, draft: RealtimeDraft) {
  getRealtimeHub()?.publish(projectId, draft)
}

export async function publishTableSignal(
  db: AppDatabase,
  actorId: string,
  tableId: string,
  type: 'tables.changed' | 'rows.changed' | 'columns.changed',
) {
  const [table] = await db.select({ projectId: tables.projectId }).from(tables).where(eq(tables.id, tableId)).limit(1)
  if (!table) return
  publishRealtime(table.projectId, { type, actorId, projectId: table.projectId, tableId })
}

export function publishRowUpdated(actorId: string, projectId: string, tableId: string, row: RealtimeRow) {
  publishRealtime(projectId, { type: 'row.updated', actorId, projectId, tableId, row })
}
