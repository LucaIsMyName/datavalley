import { sql } from 'drizzle-orm'
import { createDatabase } from '../apps/api/src/database/client.ts'
import { loadEnv } from '../apps/api/src/config/env.ts'

const env = loadEnv()
const database = await createDatabase(env)
const plan = await database.db.execute(sql`EXPLAIN SELECT id FROM table_rows ORDER BY position, id LIMIT 50`)
console.log(JSON.stringify(plan, null, 2))
await database.close()
