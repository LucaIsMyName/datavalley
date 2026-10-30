import { existsSync } from 'node:fs'
import { loadEnv } from './config/env.js'
import { createDatabase } from './database/client.js'
import { buildApp } from './app.js'

function loadDotEnv() {
  for (const path of ['.env', '../../.env']) {
    if (existsSync(path)) {
      process.loadEnvFile(path)
      return
    }
  }
}

loadDotEnv()
const env = loadEnv()
const database = await createDatabase(env)
const app = await buildApp({ env, db: database.db })
await app.listen({ host: env.API_HOST, port: env.API_PORT })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close()
    await database.close()
    process.exit(0)
  })
}
