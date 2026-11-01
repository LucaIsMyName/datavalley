import type { AppDatabase } from '../database/client.js'
import type { Env } from '../config/env.js'
import { runJob as runStoredJob } from '../modules/platform/service.js'
import { executeConnectorSyncJob } from '../modules/connectors/sync.js'

export { createJob, runJob } from '../modules/platform/service.js'

export async function dispatchBackgroundJob(db: AppDatabase, env: Env, jobId: string) {
  return runStoredJob(db, jobId, async (payload) => {
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
    if (body.type === 'connector.sync') {
      return executeConnectorSyncJob(db, env, {
        connectorId: String(body.connectorId ?? ''),
        tableId: body.tableId ? String(body.tableId) : undefined,
        actorUserId: body.actorUserId ? String(body.actorUserId) : undefined,
        syncJobId: body.syncJobId ? String(body.syncJobId) : undefined,
      })
    }
    return body
  })
}
