import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import csrf from '@fastify/csrf-protection'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { sql } from 'drizzle-orm'
import Fastify from 'fastify'
import type { Env } from './config/env.js'
import type { AppDatabase } from './database/client.js'
import { AppError } from './errors.js'
import { passwordChangeGate, registerAuthRoutes, sessionCookie } from './modules/auth/routes.js'
import { registerDataRoutes } from './modules/data/routes.js'
import { subjectFromSession } from './modules/auth/service.js'
import { ensurePlugins, subjectFromApiKey } from './modules/platform/service.js'
import { registerProjectRoutes } from './modules/projects/routes.js'
import { registerUserRoutes } from './modules/users/routes.js'
import './types.js'

export async function buildApp(options: { env: Env; db: AppDatabase }) {
  const { env, db } = options
  const app = Fastify({
    logger: env.NODE_ENV === 'test' ? false : { level: env.LOG_LEVEL },
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 12 * 1024 * 1024,
    genReqId: (request) => (request.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID(),
  })
  app.decorateRequest('subject', null)
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    try {
      const text = typeof body === 'string' ? body : ''
      request.rawBody = text
      done(null, text ? JSON.parse(text) : {})
    } catch (error) {
      done(error as Error, undefined)
    }
  })
  await app.register(helmet)
  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true })
  await app.register(cookie, { secret: env.CSRF_SECRET })
  await app.register(csrf, { cookieOpts: { signed: true, httpOnly: true, sameSite: 'lax', path: '/' } })
  await app.register(rateLimit, { max: env.RATE_LIMIT_MAX, timeWindow: env.RATE_LIMIT_WINDOW })
  await app.register(multipart, { limits: { fileSize: env.MEDIA_MAX_BYTES } })
  await app.register(swagger, {
    openapi: { info: { title: 'Datavalley API', version: '0.0.1' }, servers: [{ url: '/api/v1' }] },
  })
  await app.register(swaggerUi, { routePrefix: '/docs' })

  app.addHook('onRequest', async (request) => {
    const header = request.headers.authorization
    if (header?.toLowerCase().startsWith('bearer ')) {
      request.subject = await subjectFromApiKey(db, header.slice(7).trim(), request.ip)
      return
    }
    const token = sessionCookie(request)
    request.subject = token ? await subjectFromSession(db, token) : null
  })
  app.addHook('preHandler', async (request, reply) => {
    if (request.subject?.user?.mustChangePassword) passwordChangeGate(request.url, request.method)
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return
    if (request.headers.authorization?.toLowerCase().startsWith('bearer ')) return
    if (/\/integrations\/[^/]+\/webhook/.test(request.url.split('?')[0])) return
    await new Promise<void>((resolve, reject) => {
      app.csrfProtection(request, reply, (error?: Error) => (error ? reject(error) : resolve()))
    })
  })
  app.setErrorHandler((error, request, reply) => {
    const err = error as Error & { statusCode?: number; validation?: unknown }
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details ?? undefined } })
    }
    const statusCode = err.statusCode
    if (statusCode === 429) return reply.status(429).send({ error: { code: 'rate_limited', message: 'Too many requests' } })
    if (statusCode === 403 && /csrf/i.test(err.message)) {
      return reply.status(403).send({ error: { code: 'csrf_invalid', message: 'CSRF token missing or invalid' } })
    }
    if (err.validation) {
      return reply.status(400).send({ error: { code: 'validation_error', message: 'Request validation failed', details: err.validation } })
    }
    if (env.NODE_ENV !== 'test') request.log.error(err)
    return reply.status(statusCode && statusCode >= 400 ? statusCode : 500).send({
      error: {
        code: 'internal_error',
        message: env.NODE_ENV === 'test' ? err.message : 'Internal error',
      },
    })
  })

  await app.register(
    async (api) => {
      api.get('/health', async () => {
        await db.execute(sql`select 1 as ok`)
        return { ok: true, database: 'up' }
      })
      registerAuthRoutes(api, db, env)
      registerUserRoutes(api, db, env)
      registerProjectRoutes(api, db)
      registerDataRoutes(api, db, env)
    },
    { prefix: '/api/v1' },
  )
  await ensurePlugins(db)
  return app
}
