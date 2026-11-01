import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import type { Env } from '../config/env.js'

let queue: Queue | null = null

function getQueue(env: Env) {
  const url = env.REDIS_URL?.trim()
  if (!url) return null
  if (!queue) {
    const connection = new Redis(url, { maxRetriesPerRequest: null })
    queue = new Queue('datavalley', { connection })
  }
  return queue
}

export async function enqueueBackgroundJob(env: Env, jobId: string) {
  const q = getQueue(env)
  if (!q) return false
  await q.add('run', { jobId }, { removeOnComplete: 100, removeOnFail: 200 })
  return true
}
