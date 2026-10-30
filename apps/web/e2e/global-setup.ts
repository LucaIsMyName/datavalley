import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'

const env = {
  ...process.env,
  DATABASE_URL: 'pglite:./data/e2e',
  SESSION_SECRET: 'playwright-session-secret-32-characters',
  CSRF_SECRET: 'playwright-csrf-secret-32-characters-xx',
  CREDENTIALS_KEY: 'playwright-credentials-key-32-chars',
  INITIAL_ADMIN_USERNAME: 'admin',
  INITIAL_ADMIN_EMAIL: 'admin@example.com',
  INITIAL_ADMIN_PASSWORD: 'playwright-admin-password',
}

rmSync('data/e2e', { recursive: true, force: true })
const seed = spawnSync('npm', ['run', 'seed:admin'], { env, stdio: 'inherit' })
if (seed.status !== 0) process.exit(seed.status ?? 1)
