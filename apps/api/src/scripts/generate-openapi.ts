import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatApiMarkdown } from '../../../web/src/features/docs/api-markdown'
import { listApiGroups, type OpenApiSpec } from '../../../web/src/features/docs/api-ref'
import { testEnv } from '../config/env.js'
import { createDatabase } from '../database/client.js'
import { buildApp } from '../app.js'

const env = testEnv()
const database = await createDatabase(env)
const app = await buildApp({ env, db: database.db })
await app.ready()
const spec = app.swagger() as OpenApiSpec
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
writeFileSync(resolve(root, 'packages/contracts/openapi.json'), `${JSON.stringify(spec, null, 2)}\n`)
writeFileSync(resolve(root, 'docs/api.md'), formatApiMarkdown(listApiGroups(spec)))
await app.close()
await database.close()
