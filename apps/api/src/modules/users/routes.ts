import { Type } from '@sinclair/typebox'
import type { Action } from '@datavalley/shared'
import type { FastifyInstance } from 'fastify'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { AppError, unauthorized } from '../../errors.js'
import { userResponse } from '../auth/schema.js'
import { createUser, getUser, listUsers, removeUser, resetPassword, setDisabled, setSystemGrants, updateUser } from './service.js'

function admin(request: { subject: { role: string } | null }) {
  if (request.subject?.role !== 'admin') throw new AppError(403, 'forbidden', 'Admin access is required')
}

export function registerUserRoutes(app: FastifyInstance, db: AppDatabase, env: Env) {
  app.get('/users', async (request) => {
    admin(request)
    const query = request.query as { offset?: string; limit?: string }
    const users = await listUsers(db, Number(query.offset ?? 0), Math.min(Number(query.limit ?? 50), 100))
    return { users }
  })

  app.post(
    '/users',
    {
      schema: {
        body: Type.Object({
          username: Type.String(),
          email: Type.String(),
          password: Type.String({ minLength: 12 }),
          role: Type.Union([Type.Literal('admin'), Type.Literal('user')]),
        }),
        response: { 200: Type.Object({ user: userResponse }) },
      },
    },
    async (request) => {
      admin(request)
      if (!request.subject) throw unauthorized()
      const user = await createUser(db, env, request.subject, request.body as never)
      return { user }
    },
  )

  app.get('/users/:id', async (request) => {
    if (!request.subject) throw unauthorized()
    return { user: await getUser(db, request.subject, (request.params as { id: string }).id) }
  })

  app.patch('/users/:id', async (request) => {
    if (!request.subject) throw unauthorized()
    const user = await updateUser(db, request.subject, (request.params as { id: string }).id, request.body as never)
    return { user }
  })

  app.delete('/users/:id', async (request) => {
    if (!request.subject) throw unauthorized()
    await removeUser(db, request.subject, (request.params as { id: string }).id)
    return { ok: true }
  })

  app.post('/users/:id/reset-password', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { password: string }
    await resetPassword(db, env, request.subject, (request.params as { id: string }).id, body.password)
    return { ok: true }
  })

  app.post('/users/:id/disable', async (request) => {
    if (!request.subject) throw unauthorized()
    return { user: await setDisabled(db, request.subject, (request.params as { id: string }).id, true) }
  })

  app.post('/users/:id/enable', async (request) => {
    if (!request.subject) throw unauthorized()
    return { user: await setDisabled(db, request.subject, (request.params as { id: string }).id, false) }
  })

  app.put('/users/:id/permissions', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { grants: { action: Action; effect: 'allow' | 'deny' }[] }
    await setSystemGrants(db, request.subject, (request.params as { id: string }).id, body.grants ?? [])
    return { ok: true }
  })
}
