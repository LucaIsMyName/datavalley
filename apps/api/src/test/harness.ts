import { eq } from 'drizzle-orm'
import type { FastifyInstance, InjectOptions } from 'fastify'
import { testEnv, type Env } from '../config/env.js'
import { createDatabase, type AppDatabase } from '../database/client.js'
import { organizations, users } from '../database/schema.js'
import { buildApp } from '../app.js'
import { hashPassword } from '../security/passwords.js'

export type Harness = {
  app: FastifyInstance
  db: AppDatabase
  env: Env
  organizationId: string
  close: () => Promise<void>
}

export async function createHarness(overrides: Partial<Env> = {}): Promise<Harness> {
  const env = testEnv(overrides)
  const database = await createDatabase(env)
  const [organization] = await database.db.insert(organizations).values({ name: 'Default' }).returning()
  const app = await buildApp({ env, db: database.db })
  await app.ready()
  return {
    app,
    db: database.db,
    env,
    organizationId: organization.id,
    close: async () => {
      await app.close()
      await database.close()
    },
  }
}

export class ApiSession {
  cookies = new Map<string, string>()
  csrf = ''

  constructor(private app: FastifyInstance) {}

  private cookieHeader() {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ')
  }

  private store(response: { headers: Record<string, unknown> }) {
    const raw = response.headers['set-cookie']
    const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : []
    for (const cookie of list) {
      const [pair] = String(cookie).split(';')
      const index = pair.indexOf('=')
      if (index > 0) this.cookies.set(pair.slice(0, index), pair.slice(index + 1))
    }
  }

  async prepare() {
    const response = await this.app.inject({ method: 'GET', url: '/api/v1/auth/csrf' })
    this.store(response)
    this.csrf = response.json().token
    return this
  }

  async inject(options: InjectOptions) {
    const headers: Record<string, string> = { ...(options.headers as Record<string, string> | undefined), cookie: this.cookieHeader() }
    if (options.method && options.method !== 'GET' && options.method !== 'HEAD') headers['csrf-token'] = this.csrf
    const response = await this.app.inject({ ...options, headers })
    this.store(response)
    return response
  }
}

export async function createUser(
  db: AppDatabase,
  env: Env,
  organizationId: string,
  input: { username: string; email: string; password: string; role?: 'admin' | 'user'; mustChangePassword?: boolean },
) {
  const [user] = await db
    .insert(users)
    .values({
      organizationId,
      username: input.username.toLowerCase(),
      email: input.email.toLowerCase(),
      passwordHash: await hashPassword(input.password, env),
      role: input.role ?? 'user',
      mustChangePassword: input.mustChangePassword ?? false,
    })
    .returning()
  return user
}

export async function login(session: ApiSession, loginName: string, password: string) {
  const response = await session.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { login: loginName, password } })
  return response
}

export async function userByName(db: AppDatabase, username: string) {
  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1)
  return user
}
