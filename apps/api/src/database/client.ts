import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite'
import pg from 'pg'
import type { Env } from '../config/env.js'
import { applyMigrations } from './migrate.js'
import * as schema from './schema.js'

export type AppDatabase = PgliteDatabase<typeof schema>

export type DatabaseHandle = {
  db: AppDatabase
  close: () => Promise<void>
}

function embeddedPath(raw: string) {
  if (raw.startsWith('/')) return raw
  const parts = process.cwd().split('/')
  const appsIndex = parts.lastIndexOf('apps')
  const workspaceRoot = appsIndex > 0 ? parts.slice(0, appsIndex).join('/') : ''
  if (workspaceRoot && existsSync(resolve(workspaceRoot, 'package.json'))) return resolve(workspaceRoot, raw)
  return resolve(process.cwd(), raw)
}

export async function createDatabase(env: Env): Promise<DatabaseHandle> {
  const timeout = Number.isFinite(env.STATEMENT_TIMEOUT_MS) ? env.STATEMENT_TIMEOUT_MS : 5000
  if (env.DATABASE_URL === 'pglite' || env.DATABASE_URL.startsWith('pglite:')) {
    const path = env.DATABASE_URL === 'pglite' ? undefined : embeddedPath(env.DATABASE_URL.slice('pglite:'.length))
    const client = new PGlite(path)
    await client.waitReady
    await applyMigrations(
      async (sql) => {
        await client.exec(sql)
      },
      async (sql) => (await client.query<{ id: string }>(sql)).rows,
    )
    await client.exec(`SET statement_timeout = ${timeout}`)
    return {
      db: drizzlePglite(client, { schema }),
      close: () => client.close(),
    }
  }

  const pool = new pg.Pool({ connectionString: env.DATABASE_URL })
  pool.on('connect', (client) => {
    void client.query(`SET statement_timeout = ${timeout}`)
  })
  await applyMigrations(
    async (sql) => {
      await pool.query(sql)
    },
    async (sql) => (await pool.query<{ id: string }>(sql)).rows,
  )
  return {
    db: drizzlePg(pool, { schema }) as unknown as AppDatabase,
    close: () => pool.end(),
  }
}
