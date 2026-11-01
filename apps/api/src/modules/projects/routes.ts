import type { Action } from '@datavalley/shared'
import type { FastifyInstance } from 'fastify'
import type { AppDatabase } from '../../database/client.js'
import { unauthorized } from '../../errors.js'
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
import {
  addMemberBody,
  createProjectBody,
  directoryQuery,
  listProjectsQuery,
  patchProjectBody,
  projectIdParams,
  projectMemberParams,
  projectPermissionsBody,
  setMemberDisabledBody,
} from './schema.js'

export function registerProjectRoutes(app: FastifyInstance, db: AppDatabase) {
  app.get('/projects', { schema: { querystring: listProjectsQuery } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const query = request.query as { includeArchived?: string }
    return { projects: await listProjects(db, request.subject, query.includeArchived === 'true') }
  })

  app.post('/projects', { schema: { body: createProjectBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    return { project: await createProject(db, request.subject, request.body as { name: string; template?: 'blank' | 'customers' }) }
  })

  app.get('/projects/:id', { schema: { params: projectIdParams } }, async (request) => {
    if (!request.subject) throw unauthorized()
    return { project: await getProject(db, request.subject, (request.params as { id: string }).id) }
  })

  app.patch('/projects/:id', { schema: { params: projectIdParams, body: patchProjectBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { name?: string; description?: string; settings?: Record<string, unknown>; icon?: string }
    return { project: await updateProject(db, request.subject, (request.params as { id: string }).id, body) }
  })

  app.delete('/projects/:id', { schema: { params: projectIdParams } }, async (request) => {
    if (!request.subject) throw unauthorized()
    await deleteProject(db, request.subject, (request.params as { id: string }).id)
    return { ok: true }
  })

  app.post('/projects/:id/archive', { schema: { params: projectIdParams } }, async (request) => {
    if (!request.subject) throw unauthorized()
    return { project: await setArchived(db, request.subject, (request.params as { id: string }).id, true) }
  })

  app.post('/projects/:id/restore', { schema: { params: projectIdParams } }, async (request) => {
    if (!request.subject) throw unauthorized()
    return { project: await setArchived(db, request.subject, (request.params as { id: string }).id, false) }
  })

  app.get('/projects/:id/directory', { schema: { params: projectIdParams, querystring: directoryQuery } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const query = request.query as { q?: string }
    const params = request.params as { id: string }
    return { users: await listDirectory(db, request.subject, params.id, query.q ?? '') }
  })

  app.get('/projects/:id/members', { schema: { params: projectIdParams } }, async (request) => {
    if (!request.subject) throw unauthorized()
    return listMembers(db, request.subject, (request.params as { id: string }).id)
  })

  app.post('/projects/:id/members', { schema: { params: projectIdParams, body: addMemberBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { username: string }
    return { member: await addMember(db, request.subject, (request.params as { id: string }).id, body.username) }
  })

  app.patch('/projects/:id/members/:userId', { schema: { params: projectMemberParams, body: setMemberDisabledBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const params = request.params as { id: string; userId: string }
    const body = request.body as { disabled: boolean }
    return { member: await setMemberDisabled(db, request.subject, params.id, params.userId, body.disabled) }
  })

  app.delete('/projects/:id/members/:userId', { schema: { params: projectMemberParams } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const params = request.params as { id: string; userId: string }
    await removeMember(db, request.subject, params.id, params.userId)
    return { ok: true }
  })

  app.put('/projects/:id/permissions', { schema: { params: projectIdParams, body: projectPermissionsBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const params = request.params as { id: string }
    const body = request.body as { userId: string; grants: { action: Action; effect: 'allow' | 'deny' }[] }
    await setProjectGrants(db, request.subject, params.id, body.userId, body.grants)
    return { ok: true }
  })
}
