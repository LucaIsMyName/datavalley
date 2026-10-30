import { Type } from '@sinclair/typebox'
import type { FastifyInstance } from 'fastify'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { AppError, unauthorized } from '../../errors.js'
import { changePassword, listSessions, login, logout, publicUser, revokeSession } from './service.js'
import { changePasswordBody, loginBody, userResponse } from './schema.js'

const SESSION_COOKIE = 'dv_session'
const MAX_AGE = 14 * 24 * 60 * 60

export function sessionCookie(request: { cookies: Record<string, string | undefined> }) {
  return request.cookies[SESSION_COOKIE]
}

export function registerAuthRoutes(app: FastifyInstance, db: AppDatabase, env: Env) {
  app.get('/auth/csrf', async (_request, reply) => {
    const token = reply.generateCsrf()
    return { token }
  })

  app.post('/auth/login', { schema: { body: loginBody, response: { 200: TypeUserLogin() } }, config: { rateLimit: { max: env.LOGIN_RATE_LIMIT_MAX, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const body = request.body as { login: string; password: string; totpCode?: string }
    const result = await login(db, env, body, { ip: request.ip, userAgent: request.headers['user-agent'] })
    reply.setCookie(SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
      maxAge: MAX_AGE,
    })
    return { user: publicUser(result.user), mustChangePassword: result.user.mustChangePassword }
  })

  app.post('/auth/logout', async (request, reply) => {
    const token = sessionCookie(request)
    if (token) await logout(db, token)
    reply.clearCookie(SESSION_COOKIE, { path: '/' })
    return { ok: true }
  })

  app.get('/auth/me', { schema: { response: { 200: Type.Object({ user: userResponse }) } } }, async (request) => {
    if (!request.subject?.user) throw unauthorized()
    return { user: publicUser(request.subject.user) }
  })

  app.post('/auth/change-password', { schema: { body: changePasswordBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { currentPassword: string; newPassword: string }
    await changePassword(db, env, request.subject, body)
    return { ok: true }
  })

  app.get('/sessions', async (request) => {
    if (!request.subject?.user) throw unauthorized()
    return { sessions: await listSessions(db, request.subject.id) }
  })

  app.delete('/sessions/:id', async (request) => {
    if (!request.subject?.user) throw unauthorized()
    const params = request.params as { id: string }
    await revokeSession(db, request.subject.id, params.id)
    return { ok: true }
  })
}

function TypeUserLogin() {
  return {
    type: 'object',
    properties: {
      user: userResponse,
      mustChangePassword: { type: 'boolean' },
    },
    required: ['user', 'mustChangePassword'],
  }
}

export function passwordChangeGate(requestUrl: string, method: string) {
  const path = requestUrl.split('?')[0]
  const allowed = new Set(['/api/v1/auth/change-password', '/api/v1/auth/logout', '/api/v1/auth/me', '/api/v1/auth/csrf'])
  if (allowed.has(path)) return
  if (method === 'GET' && path === '/api/v1/health') return
  throw new AppError(403, 'password_change_required', 'Change the initial password before continuing')
}
