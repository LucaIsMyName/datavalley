import { existsSync } from 'node:fs'
import { loadEnv } from '../config/env.js'
import { createDatabase } from './client.js'

for (const path of ['.env', '../../.env']) {
  if (existsSync(path)) {
    process.loadEnvFile(path)
    break
  }
}

const database = await createDatabase(loadEnv())
console.log('Migrations applied')
await database.close()
