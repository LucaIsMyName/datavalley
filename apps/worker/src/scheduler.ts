import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import type { Env } from '../../api/src/config/env.js'
import type { AppDatabase } from '../../api/src/database/client.js'
import { createJob } from '../../api/src/modules/platform/service.js'
import { listScheduledConnectors } from '../../api/src/modules/connectors/service.js'
import { connectorSyncJobs } from '../../api/src/database/schema.js'

const lastRun = new Map<string, string>()

function presetBucket(preset: string, now = new Date()) {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const d = now.getUTCDate()
  const h = now.getUTCHours()
  if (preset === 'hourly') return `${y}-${m}-${d}-${h}`
  if (preset === 'daily') return `${y}-${m}-${d}`
  if (preset === 'weekly') return `${y}-${m}-${d - now.getUTCDay()}`
  return ''
}

export function startConnectorScheduler(env: Env, db: AppDatabase) {
  const url = env.REDIS_URL?.trim()
  if (!url) return
  const connection = new Redis(url, { maxRetriesPerRequest: null })
  const queue = new Queue('datavalley', { connection })
  const tick = async () => {
    const connectors = await listScheduledConnectors(db)
    for (const connector of connectors) {
      const schedule = connector.schedule as { preset?: string }
      const preset = schedule.preset ?? 'manual'
      if (preset === 'manual') continue
      const bucket = presetBucket(preset)
      const key = `${connector.id}:${bucket}`
      if (lastRun.get(connector.id) === key) continue
      lastRun.set(connector.id, key)
      const [syncJob] = await db
        .insert(connectorSyncJobs)
        .values({ connectorId: connector.id, status: 'running' })
        .returning()
      const job = await createJob(db, 'connector.sync', {
        type: 'connector.sync',
        connectorId: connector.id,
        syncJobId: syncJob.id,
      })
      await queue.add('run', { jobId: job.id }, { removeOnComplete: 100, removeOnFail: 200 })
    }
  }
  void tick()
  setInterval(() => void tick(), 60_000)
}
