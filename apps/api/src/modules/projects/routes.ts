import type { Action, GrantPresetId } from '@datavalley/shared'
import type { FastifyInstance } from 'fastify'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { unauthorized } from '../../errors.js'
import {
  addMember,
  createProject,
  inviteMember,
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
  inviteMemberBody,
  createProjectBody,
  directoryQuery,
  importProjectBody,
  listProjectsQuery,
  patchProjectBody,
  projectIdParams,
  projectMemberParams,
  projectPermissionsBody,
  setMemberDisabledBody,
} from './schema.js'
import { listAutomations, saveAutomations } from './automations.js'
import { exportProject, importProject } from './transfer.js'

export function registerProjectRoutes(app: FastifyInstance, db: AppDatabase, env: Env) {
  app.get('/projects', { schema: { querystring: listProjectsQuery } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const query = request.query as { includeArchived?: string }
    return { projects: await listProjects(db, request.subject, query.includeArchived === 'true') }
  })

  app.post('/projects', { schema: { body: createProjectBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    return { project: await createProject(db, request.subject, request.body as { name: string; template?: 'blank' | 'customers' }) }
  })

  app.post('/projects/import', { schema: { body: importProjectBody }, bodyLimit: 64 * 1024 * 1024 }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as Record<string, unknown>
    const name = typeof body.name === 'string' ? body.name : undefined
    return importProject(db, request.subject, body, name)
  })

  app.get('/projects/:id/export', { schema: { params: projectIdParams } }, async (request, reply) => {
    if (!request.subject) throw unauthorized()
    const doc = await exportProject(db, request.subject, (request.params as { id: string }).id)
    const safe = doc.project.name.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'project'
    reply.header('Content-Disposition', `attachment; filename="${safe}.json"`)
    reply.type('application/json')
    return doc
  })

  app.get('/projects/:id/automations', { schema: { params: projectIdParams } }, async (request) => {
    if (!request.subject) throw unauthorized()
    return listAutomations(db, request.subject, (request.params as { id: string }).id)
  })

  app.put('/projects/:id/automations', { schema: { params: projectIdParams } }, async (request) => {
    if (!request.subject) throw unauthorized()
    return saveAutomations(db, request.subject, (request.params as { id: string }).id, request.body)
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
    const body = request.body as { username: string; preset?: GrantPresetId }
    return { member: await addMember(db, request.subject, (request.params as { id: string }).id, body.username, body.preset) }
  })

  app.post('/projects/:id/invites', { schema: { params: projectIdParams, body: inviteMemberBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { email: string; preset?: GrantPresetId }
    return inviteMember(db, env, request.subject, (request.params as { id: string }).id, body.email, body.preset)
  })

  app.patch('/projects/:id/members/:userId', { schema: { params: projectMemberParams, body: setMemberDisabledBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const params = request.params as { id: string; userId: string }
    const body = request.body as { disabled?: boolean; preset?: GrantPresetId }
    return { member: await setMemberDisabled(db, request.subject, params.id, params.userId, body) }
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
