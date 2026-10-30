import { defineConfig } from '@playwright/test'

const env = {
  ...process.env,
  DATABASE_URL: 'pglite:./data/e2e',
  SESSION_SECRET: 'playwright-session-secret-32-characters',
  CSRF_SECRET: 'playwright-csrf-secret-32-characters-xx',
  CREDENTIALS_KEY: 'playwright-credentials-key-32-chars',
  INITIAL_ADMIN_USERNAME: 'admin',
  INITIAL_ADMIN_EMAIL: 'admin@example.com',
  INITIAL_ADMIN_PASSWORD: 'playwright-admin-password',
  WEB_ORIGIN: 'http://127.0.0.1:5173',
  API_PORT: '3000',
}

export default defineConfig({
  testDir: 'apps/web/e2e',
  timeout: 60_000,
  globalSetup: './apps/web/e2e/global-setup.ts',
  use: { baseURL: 'http://127.0.0.1:5173' },
  webServer: [
    { command: 'npm run dev:api', env, url: 'http://127.0.0.1:3000/api/v1/health', reuseExistingServer: false, timeout: 120_000 },
    { command: 'npm run dev:web', env, url: 'http://127.0.0.1:5173', reuseExistingServer: false, timeout: 120_000 },
  ],
})
