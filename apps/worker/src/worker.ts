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

const connection = new Redis(redisUrl, { maxRetriesPerRequest: null })
const worker = new Worker(
  'datavalley',
  async (job) => {
    const databaseModule = '../../api/src/database/client.ts'
    const envModule = '../../api/src/config/env.ts'
    const jobsModule = '../../api/src/jobs/process.ts'
    const { createDatabase } = await import(databaseModule)
    const { loadEnv } = await import(envModule)
    const { dispatchBackgroundJob } = await import(jobsModule)
    const env = loadEnv()
    const database = await createDatabase(env)
    try {
      await dispatchBackgroundJob(database.db, env, String(job.data.jobId))
    } finally {
      await database.close()
    }
  },
  { connection },
)

worker.on('ready', async () => {
  console.log('worker ready')
  const envModule = '../../api/src/config/env.ts'
  const databaseModule = '../../api/src/database/client.ts'
  const schedulerModule = './scheduler.ts'
  const { loadEnv } = await import(envModule)
  const { createDatabase } = await import(databaseModule)
  const { startConnectorScheduler } = await import(schedulerModule)
  const env = loadEnv()
  const database = await createDatabase(env)
  startConnectorScheduler(env, database.db)
})

const shutdown = async () => {
  await worker.close()
  await connection.quit()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
