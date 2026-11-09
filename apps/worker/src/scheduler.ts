import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import type { Env } from '../../api/src/config/env.js'
import type { AppDatabase } from '../../api/src/database/client.js'
import { createJob } from '../../api/src/modules/platform/service.js'
import { listScheduledConnectors } from '../../api/src/modules/connectors/service.js'
import { connectorSyncJobs } from '../../api/src/database/schema.js'

const CLAIM_TTL_SECONDS = 8 * 24 * 60 * 60

function isoWeek(now: Date) {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const weekday = day.getUTCDay() || 7
  day.setUTCDate(day.getUTCDate() + 4 - weekday)
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1)
  return { year: day.getUTCFullYear(), week: Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7) }
}

/** The period a scheduled sync belongs to. One sync runs per connector and bucket. */
export function presetBucket(preset: string, now = new Date()) {
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth() + 1
  const d = now.getUTCDate()
  const h = now.getUTCHours()
  if (preset === 'hourly') return `${y}-${m}-${d}-${h}`
  if (preset === 'daily') return `${y}-${m}-${d}`
  if (preset === 'weekly') {
    const { year, week } = isoWeek(now)
    return `${year}-W${week}`
  }
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
      if (!bucket) continue
      // Claimed in Redis, not memory, so a restarted or second worker does not run the same bucket again.
      const claimed = await connection.set(`datavalley:connector-schedule:${connector.id}:${bucket}`, '1', 'EX', CLAIM_TTL_SECONDS, 'NX')
      if (claimed !== 'OK') continue
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
  const run = () =>
    tick().catch((error: unknown) => {
      console.error('Connector scheduler tick failed', error)
    })
  void run()
  setInterval(run, 60_000)
}
