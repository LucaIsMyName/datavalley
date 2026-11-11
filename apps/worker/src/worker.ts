import { existsSync } from 'node:fs'
import { Worker } from 'bullmq'
import { Redis } from 'ioredis'

function loadDotEnv() {
  for (const path of ['.env', '../../.env']) {
    if (existsSync(path)) {
      process.loadEnvFile(path)
      return
    }
  }
}

loadDotEnv()
const redisUrl = process.env.REDIS_URL?.trim()
if (!redisUrl) {
  // Non-zero so systemd and compose report a failed service instead of a worker that silently does nothing.
  console.error('REDIS_URL is not set. The worker needs Redis to run background jobs and connector schedules.')
  process.exit(1)
}

const databaseModule = '../../api/src/database/client.ts'
const envModule = '../../api/src/config/env.ts'
const jobsModule = '../../api/src/jobs/process.ts'
const schedulerModule = './scheduler.ts'
const { createDatabase } = await import(databaseModule)
const { loadEnv } = await import(envModule)
const { dispatchBackgroundJob } = await import(jobsModule)
const { startConnectorScheduler } = await import(schedulerModule)

const env = loadEnv()
// Migrate once when the process starts. Opening a pool per job would migrate on every sync.
const database = await createDatabase(env)
let stopScheduler: (() => Promise<void>) | undefined

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null })
const worker = new Worker(
  'datavalley',
  async (job) => {
    await dispatchBackgroundJob(database.db, env, String(job.data.jobId))
  },
  { connection },
)

worker.on('ready', () => {
  console.log('worker ready')
  stopScheduler = startConnectorScheduler(env, database.db)
})

const shutdown = async () => {
  await worker.close()
  if (stopScheduler) await stopScheduler()
  await database.close()
  await connection.quit()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
