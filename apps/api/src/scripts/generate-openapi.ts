import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { testEnv } from '../config/env.js'
import { createDatabase } from '../database/client.js'
import { buildApp } from '../app.js'

const env = testEnv()
const database = await createDatabase(env)
const app = await buildApp({ env, db: database.db })
await app.ready()
const spec = app.swagger()
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../packages/contracts/openapi.json')
writeFileSync(out, `${JSON.stringify(spec, null, 2)}\n`)
await app.close()
await database.close()
