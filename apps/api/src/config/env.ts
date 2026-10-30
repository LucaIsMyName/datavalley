export type Env = {
  NODE_ENV: string
  DATABASE_URL: string
  SESSION_SECRET: string
  CSRF_SECRET: string
  CREDENTIALS_KEY: string
  WEB_ORIGIN: string
  API_HOST: string
  API_PORT: number
  LOG_LEVEL: string
  TRUST_PROXY: boolean
  MEDIA_ROOT: string
  MEDIA_MAX_BYTES: number
  INITIAL_ADMIN_EMAIL: string
  INITIAL_ADMIN_USERNAME: string
  INITIAL_ADMIN_PASSWORD: string
  REDIS_URL: string | null
  IMPORT_SYNC_LIMIT: number
  EXPORT_SYNC_LIMIT: number
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  GOOGLE_REDIRECT_URI: string
  S3_ENDPOINT: string
  S3_BUCKET: string
  S3_ACCESS_KEY: string
  S3_SECRET_KEY: string
  S3_REGION: string
  STATEMENT_TIMEOUT_MS: number
  RATE_LIMIT_MAX: number
  RATE_LIMIT_WINDOW: string
  LOGIN_RATE_LIMIT_MAX: number
  SMTP_HOST: string
  SMTP_PORT: number
  SMTP_USER: string
  SMTP_PASSWORD: string
  SMTP_FROM: string
}

function required(source: NodeJS.ProcessEnv, key: string, min = 1): string {
  const value = source[key]?.trim()
  if (!value || value.length < min) throw new Error(`${key} is required`)
  return value
}

function numberValue(source: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = source[key]
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) throw new Error(`${key} must be a number`)
  return parsed
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return {
    NODE_ENV: source.NODE_ENV ?? 'development',
    DATABASE_URL: required(source, 'DATABASE_URL'),
    SESSION_SECRET: required(source, 'SESSION_SECRET', 32),
    CSRF_SECRET: required(source, 'CSRF_SECRET', 32),
    CREDENTIALS_KEY: required(source, 'CREDENTIALS_KEY', 32),
    WEB_ORIGIN: source.WEB_ORIGIN?.trim() || 'http://localhost:5173',
    API_HOST: source.API_HOST?.trim() || '127.0.0.1',
    API_PORT: numberValue(source, 'API_PORT', 3000),
    LOG_LEVEL: source.LOG_LEVEL?.trim() || 'info',
    TRUST_PROXY: source.TRUST_PROXY === 'true',
    MEDIA_ROOT: source.MEDIA_ROOT?.trim() || './data/media',
    MEDIA_MAX_BYTES: numberValue(source, 'MEDIA_MAX_BYTES', 10 * 1024 * 1024),
    INITIAL_ADMIN_EMAIL: source.INITIAL_ADMIN_EMAIL?.trim() || 'admin@example.com',
    INITIAL_ADMIN_USERNAME: source.INITIAL_ADMIN_USERNAME?.trim() || 'admin',
    INITIAL_ADMIN_PASSWORD: source.INITIAL_ADMIN_PASSWORD?.trim() || '',
    REDIS_URL: source.REDIS_URL?.trim() || null,
    IMPORT_SYNC_LIMIT: numberValue(source, 'IMPORT_SYNC_LIMIT', 5000),
    EXPORT_SYNC_LIMIT: numberValue(source, 'EXPORT_SYNC_LIMIT', 5000),
    GOOGLE_CLIENT_ID: source.GOOGLE_CLIENT_ID?.trim() || '',
    GOOGLE_CLIENT_SECRET: source.GOOGLE_CLIENT_SECRET?.trim() || '',
    GOOGLE_REDIRECT_URI: source.GOOGLE_REDIRECT_URI?.trim() || '',
    S3_ENDPOINT: source.S3_ENDPOINT?.trim() || '',
    S3_BUCKET: source.S3_BUCKET?.trim() || '',
    S3_ACCESS_KEY: source.S3_ACCESS_KEY?.trim() || '',
    S3_SECRET_KEY: source.S3_SECRET_KEY?.trim() || '',
    S3_REGION: source.S3_REGION?.trim() || 'us-east-1',
    STATEMENT_TIMEOUT_MS: numberValue(source, 'STATEMENT_TIMEOUT_MS', 5000),
    RATE_LIMIT_MAX: numberValue(source, 'RATE_LIMIT_MAX', 300),
    RATE_LIMIT_WINDOW: source.RATE_LIMIT_WINDOW?.trim() || '1 minute',
    LOGIN_RATE_LIMIT_MAX: numberValue(source, 'LOGIN_RATE_LIMIT_MAX', 30),
    SMTP_HOST: source.SMTP_HOST?.trim() || '',
    SMTP_PORT: numberValue(source, 'SMTP_PORT', 587),
    SMTP_USER: source.SMTP_USER?.trim() || '',
    SMTP_PASSWORD: source.SMTP_PASSWORD?.trim() || '',
    SMTP_FROM: source.SMTP_FROM?.trim() || '',
  }
}

export function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: 'pglite',
      SESSION_SECRET: 'test-session-secret-must-be-32-characters',
      CSRF_SECRET: 'test-csrf-secret-must-be-32-characters-long',
      CREDENTIALS_KEY: 'test-credentials-key-must-be-32-characters',
      WEB_ORIGIN: 'http://localhost:5173',
      RATE_LIMIT_MAX: '10000',
      LOGIN_RATE_LIMIT_MAX: '1000',
      IMPORT_SYNC_LIMIT: '5000',
      EXPORT_SYNC_LIMIT: '5000',
    }),
    ...overrides,
  }
}
