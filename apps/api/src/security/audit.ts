import { auditLogs } from '../database/schema.js'
import type { AppDatabase } from '../database/client.js'
import type { Subject } from './subject.js'

export async function writeAudit(
  db: AppDatabase,
  subject: Pick<Subject, 'id' | 'kind' | 'source'> | null,
  entry: {
    action: string
    resourceType: string
    resourceId?: string | null
    metadata?: Record<string, unknown>
    ip?: string | null
  },
) {
  await db.insert(auditLogs).values({
    actorId: subject?.id ?? null,
    actorType: subject?.kind ?? 'anonymous',
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    metadata: entry.metadata ?? {},
    source: subject?.source ?? 'web',
    ip: entry.ip ?? null,
  })
}
