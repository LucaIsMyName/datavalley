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
  console.log('REDIS_URL is not set. The worker is idle until Redis is configured.')
  process.exit(0)
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
    const { runJob } = await import(jobsModule)
    const env = loadEnv()
    const database = await createDatabase(env)
    try {
      await runJob(database.db, String(job.data.jobId), async (payload: unknown) => payload)
    } finally {
      await database.close()
    }
  },
  { connection },
)

worker.on('ready', () => {
  console.log('worker ready')
})

const shutdown = async () => {
  await worker.close()
  await connection.quit()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
