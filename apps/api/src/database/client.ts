import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite'
import pg from 'pg'
import type { Env } from '../config/env.js'
import { applyMigrations } from './migrate.js'
import * as schema from './schema.js'

export type AppDatabase = PgliteDatabase<typeof schema>

export type DbTransaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0]

/** Root drizzle client or an open transaction callback handle. */
export type DbExecutor = AppDatabase | DbTransaction

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
    // The synchronous constructor skips installing extension bundles, so pg_trgm needs PGlite.create.
    const client = await PGlite.create({ dataDir: path, extensions: { pg_trgm } })
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
  // One session holds the lock for the whole migration so two processes cannot apply the same file.
  const locked = await pool.connect()
  try {
    await locked.query('SELECT pg_advisory_lock(872341, 162342)')
    try {
      await applyMigrations(
        async (statement) => {
          await locked.query(statement)
        },
        async (statement) => (await locked.query<{ id: string }>(statement)).rows,
      )
    } finally {
      await locked.query('SELECT pg_advisory_unlock(872341, 162342)')
    }
  } finally {
    locked.release()
  }
  return {
    db: drizzlePg(pool, { schema }) as unknown as AppDatabase,
    close: () => pool.end(),
  }
}
