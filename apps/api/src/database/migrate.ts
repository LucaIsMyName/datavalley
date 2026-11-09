import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function applyMigrations(
  exec: (sql: string) => Promise<void>,
  query: (sql: string) => Promise<{ id: string }[]>,
) {
  await exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`)
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'sql')
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
  for (const file of files) {
    const applied = await query(`SELECT id FROM schema_migrations WHERE id = '${file}'`)
    if (applied.length > 0) continue
    await exec(readFileSync(join(dir, file), 'utf8'))
    await exec(`INSERT INTO schema_migrations (id) VALUES ('${file}')`)
  }
}
