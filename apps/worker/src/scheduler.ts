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

export function scheduleClaimKey(connectorId: string, bucket: string) {
  return `datavalley:connector-schedule:${connectorId}:${bucket}`
}

export type ScheduleClaimActions = {
  claim: (key: string) => Promise<boolean>
  release: (key: string) => Promise<void>
  insertSync: (connectorId: string) => Promise<{ id: string }>
  enqueue: (syncJobId: string, connectorId: string) => Promise<void>
}

/** Claim the bucket, then record and enqueue the sync. A failure after the claim releases it. */
export async function enqueueScheduledConnector(
  connector: { id: string; schedule: unknown },
  actions: ScheduleClaimActions,
  now = new Date(),
) {
  const schedule = connector.schedule as { preset?: string }
  const preset = schedule.preset ?? 'manual'
  if (preset === 'manual') return
  const bucket = presetBucket(preset, now)
  if (!bucket) return
  const key = scheduleClaimKey(connector.id, bucket)
  const claimed = await actions.claim(key)
  if (!claimed) return
  try {
    const syncJob = await actions.insertSync(connector.id)
    await actions.enqueue(syncJob.id, connector.id)
  } catch (error) {
    await actions.release(key)
    throw error
  }
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
      await enqueueScheduledConnector(connector, {
        // Claimed in Redis, not memory, so a restarted or second worker does not run the same bucket again.
        claim: async (key) =>
          (await connection.set(key, '1', 'EX', CLAIM_TTL_SECONDS, 'NX')) === 'OK',
        release: async (key) => {
          await connection.del(key)
        },
        insertSync: async (connectorId) => {
          const [syncJob] = await db
            .insert(connectorSyncJobs)
            .values({ connectorId, status: 'running' })
            .returning()
          if (!syncJob) throw new Error('Could not record the connector sync')
          return { id: syncJob.id }
        },
        enqueue: async (syncJobId, connectorId) => {
          const job = await createJob(db, 'connector.sync', {
            type: 'connector.sync',
            connectorId,
            syncJobId,
          })
          await queue.add('run', { jobId: job.id }, { removeOnComplete: 100, removeOnFail: 200 })
        },
      })
    }
  }
  const run = () =>
    tick().catch((error: unknown) => {
      console.error('Connector scheduler tick failed', error)
    })
  void run()
  setInterval(run, 60_000)
}
