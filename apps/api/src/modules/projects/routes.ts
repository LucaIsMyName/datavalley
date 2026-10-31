import { Type } from '@sinclair/typebox'
import type { Action } from '@datavalley/shared'
import type { FastifyInstance } from 'fastify'
import type { AppDatabase } from '../../database/client.js'
import { badRequest, unauthorized } from '../../errors.js'
import {
  addMember,
  createProject,
  deleteProject,
  getProject,
  listDirectory,
  listMembers,
  listProjects,
  removeMember,
  setMemberDisabled,
  setArchived,
  setProjectGrants,
  updateProject,
} from './service.js'

export function registerProjectRoutes(app: FastifyInstance, db: AppDatabase) {
  app.get('/projects', async (request) => {
    if (!request.subject) throw unauthorized()
    const query = request.query as { includeArchived?: string }
    return { projects: await listProjects(db, request.subject, query.includeArchived === 'true') }
  })

  app.post(
    '/projects',
    {
      schema: {
        body: Type.Object({
          name: Type.String({ minLength: 1 }),
          template: Type.Optional(Type.Union([Type.Literal('blank'), Type.Literal('customers')])),
        }),
      },
    },
    async (request) => {
      if (!request.subject) throw unauthorized()
      return { project: await createProject(db, request.subject, request.body as { name: string; template?: 'blank' | 'customers' }) }
    },
  )

  app.get('/projects/:id', async (request) => {
    if (!request.subject) throw unauthorized()
    return { project: await getProject(db, request.subject, (request.params as { id: string }).id) }
  })

  app.patch('/projects/:id', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { name?: string; description?: string; settings?: Record<string, unknown> }
    return { project: await updateProject(db, request.subject, (request.params as { id: string }).id, body) }
  })

  app.delete('/projects/:id', async (request) => {
    if (!request.subject) throw unauthorized()
    await deleteProject(db, request.subject, (request.params as { id: string }).id)
    return { ok: true }
  })

  app.post('/projects/:id/archive', async (request) => {
    if (!request.subject) throw unauthorized()
    return { project: await setArchived(db, request.subject, (request.params as { id: string }).id, true) }
  })

  app.post('/projects/:id/restore', async (request) => {
    if (!request.subject) throw unauthorized()
    return { project: await setArchived(db, request.subject, (request.params as { id: string }).id, false) }
  })

  app.get('/projects/:id/directory', async (request) => {
    if (!request.subject) throw unauthorized()
    const query = request.query as { q?: string }
    const params = request.params as { id: string }
    return { users: await listDirectory(db, request.subject, params.id, query.q ?? '') }
  })

  app.get('/projects/:id/members', async (request) => {
    if (!request.subject) throw unauthorized()
    return listMembers(db, request.subject, (request.params as { id: string }).id)
  })

  app.post('/projects/:id/members', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { username: string }
    return { member: await addMember(db, request.subject, (request.params as { id: string }).id, body.username) }
  })

  app.patch('/projects/:id/members/:userId', async (request) => {
    if (!request.subject) throw unauthorized()
    const params = request.params as { id: string; userId: string }
    const body = request.body as { disabled?: boolean }
    if (typeof body.disabled !== 'boolean') throw badRequest('disabled is required')
    return { member: await setMemberDisabled(db, request.subject, params.id, params.userId, body.disabled) }
  })

  app.delete('/projects/:id/members/:userId', async (request) => {
    if (!request.subject) throw unauthorized()
    const params = request.params as { id: string; userId: string }
    await removeMember(db, request.subject, params.id, params.userId)
    return { ok: true }
  })

  app.put('/projects/:id/permissions', async (request) => {
    if (!request.subject) throw unauthorized()
    const params = request.params as { id: string }
    const body = request.body as { userId: string; grants: { action: Action; effect: 'allow' | 'deny' }[] }
    await setProjectGrants(db, request.subject, params.id, body.userId, body.grants ?? [])
    return { ok: true }
  })
}
