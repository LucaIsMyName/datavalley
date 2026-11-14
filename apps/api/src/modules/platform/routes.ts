import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { isImageMime } from '../../security/media-mime.js'
import * as dataSchema from '../data/schema.js'
import type { Action } from '@datavalley/shared'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { pluginConnections, userFavorites } from '../../database/schema.js'
import { listFavoriteHits, listRecentHits } from '../data/library.js'
import { AppError, badRequest, notFound, unauthorized } from '../../errors.js'
import { assertCan } from '../../security/access.js'
import type { Subject } from '../../security/subject.js'
import { listMyWork } from '../rows/work.js'
import {
  configurePlugin,
  confirmTotp,
  connectionSecret,
  createApiKey,
  deleteApiKey,
  disableTotp,
  enrollTotp,
  listApiKeys,
  listAudit,
  listNotifications,
  listPlugins,
  listSyncJobs,
  getMediaDetails,
  listMedia,
  markNotificationRead,
  publicConnections,
  readMedia,
  readState,
  revokeApiKey,
  rotateApiKey,
  requirePlugin,
  setPluginEnabled,
  storeMedia,
  verifyWebhook,
} from './service.js'
import { requireUserSubject } from '../../http/guards.js'

export function registerPlatformRoutes(app: FastifyInstance, db: AppDatabase, env: Env) {
  async function assertConnectionAccess(subject: Subject, connectionId: string, action: Action) {
    const [connection] = await db
      .select({ projectId: pluginConnections.projectId })
      .from(pluginConnections)
      .where(eq(pluginConnections.id, connectionId))
      .limit(1)
    if (!connection) throw notFound()
    if (connection.projectId)
      await assertCan(db, subject, action, { type: 'project', id: connection.projectId })
    else await assertCan(db, subject, 'manage_plugins', { type: 'system', id: null })
  }

  app.get('/favorites', async (request) => {
    if (!request.subject) throw unauthorized()
    return { favorites: await listFavoriteHits(db, request.subject) }
  })
  app.post('/favorites', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { resourceType: string; resourceId: string }
    await db
      .insert(userFavorites)
      .values({
        userId: request.subject.id,
        resourceType: body.resourceType,
        resourceId: body.resourceId,
      })
      .onConflictDoNothing()
    return { ok: true }
  })
  app.delete('/favorites', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { resourceType: string; resourceId: string }
    await db
      .delete(userFavorites)
      .where(
        and(
          eq(userFavorites.userId, request.subject.id),
          eq(userFavorites.resourceType, body.resourceType),
          eq(userFavorites.resourceId, body.resourceId),
        ),
      )
    return { ok: true }
  })
  app.get('/recents', async (request) => {
    if (!request.subject) throw unauthorized()
    return { recents: await listRecentHits(db, request.subject) }
  })
  app.get('/plugins', async (request) => {
    if (!request.subject) throw unauthorized()
    return { plugins: await listPlugins(db) }
  })
  app.post('/plugins/:id/enable', async (request) => {
    if (!request.subject) throw unauthorized()
    return {
      plugin: await setPluginEnabled(
        db,
        request.subject,
        (request.params as { id: string }).id,
        true,
      ),
    }
  })
  app.post('/plugins/:id/disable', async (request) => {
    if (!request.subject) throw unauthorized()
    return {
      plugin: await setPluginEnabled(
        db,
        request.subject,
        (request.params as { id: string }).id,
        false,
      ),
    }
  })
  app.post('/plugins/:id/configure', async (request) => {
    if (!request.subject) throw unauthorized()
    return configurePlugin(
      db,
      request.subject,
      (request.params as { id: string }).id,
      (request.body as { config: Record<string, unknown> }).config,
    )
  })
  app.get('/api-keys', async (request) => {
    if (!request.subject) throw unauthorized()
    return { apiKeys: await listApiKeys(db, request.subject) }
  })
  app.post('/api-keys', async (request) => {
    if (!request.subject) throw unauthorized()
    return { apiKey: await createApiKey(db, request.subject, request.body as never) }
  })
  app.post('/api-keys/:id/rotate', async (request) => {
    if (!request.subject) throw unauthorized()
    return {
      apiKey: await rotateApiKey(db, request.subject, (request.params as { id: string }).id),
    }
  })
  app.post('/api-keys/:id/revoke', async (request) => {
    if (!request.subject) throw unauthorized()
    await revokeApiKey(db, request.subject, (request.params as { id: string }).id)
    return { ok: true }
  })
  app.delete('/api-keys/:id', async (request) => {
    if (!request.subject) throw unauthorized()
    await deleteApiKey(db, request.subject, (request.params as { id: string }).id)
    return { ok: true }
  })
  app.get('/audit', async (request) => {
    if (!request.subject) throw unauthorized()
    return listAudit(db, request.subject, request.query as never)
  })
  app.get('/work', async (request) => {
    if (!request.subject) throw unauthorized()
    return { tasks: await listMyWork(db, request.subject) }
  })
  app.get('/notifications', async (request) => {
    const subject = requireUserSubject(request)
    return { notifications: await listNotifications(db, subject.id) }
  })
  app.post('/notifications/:id/read', async (request) => {
    const subject = requireUserSubject(request)
    await markNotificationRead(db, subject.id, (request.params as { id: string }).id)
    return { ok: true }
  })
  app.post('/totp/enroll', async (request) => {
    if (!request.subject) throw unauthorized()
    return enrollTotp(db, env, request.subject)
  })
  app.post('/totp/confirm', async (request) => {
    if (!request.subject) throw unauthorized()
    return confirmTotp(db, env, request.subject, (request.body as { code: string }).code)
  })
  app.post('/totp/disable', async (request) => {
    if (!request.subject) throw unauthorized()
    await disableTotp(db, request.subject)
    return { ok: true }
  })
  app.get('/media', { schema: { querystring: dataSchema.mediaListQuery } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const query = request.query as {
      limit?: string
      cursor?: string
      q?: string
      mime?: 'image' | 'pdf'
    }
    return listMedia(db, request.subject, {
      limit: query.limit ? Number(query.limit) : 50,
      cursor: query.cursor ?? null,
      q: query.q ?? null,
      mime: query.mime ?? null,
    })
  })
  app.post('/media', { schema: { querystring: dataSchema.mediaUploadQuery } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const tableId = (request.query as { tableId?: string }).tableId
    const file = await request.file()
    if (!file) throw badRequest('Choose a file')
    return {
      file: await storeMedia(
        db,
        env,
        request.subject,
        { tableId: tableId ?? null },
        {
          filename: file.filename,
          mimetype: file.mimetype,
          buffer: await file.toBuffer(),
        },
      ),
    }
  })
  app.get('/media/:id/details', { schema: { params: dataSchema.mediaParams } }, async (request) => {
    if (!request.subject) throw unauthorized()
    return getMediaDetails(db, request.subject, (request.params as { id: string }).id)
  })
  app.get('/media/:id', { schema: { params: dataSchema.mediaParams } }, async (request, reply) => {
    if (!request.subject) throw unauthorized()
    const media = await readMedia(db, env, request.subject, (request.params as { id: string }).id)
    reply.header('content-type', media.file.mime)
    reply.header('x-content-type-options', 'nosniff')
    const safeName = media.file.originalName.replace(/[\r\n"]/g, '_') || 'download'
    if (media.file.mime === 'application/pdf') {
      reply.header('content-disposition', `inline; filename="${safeName}"`)
    } else if (!isImageMime(media.file.mime) || media.file.mime === 'image/svg+xml') {
      reply.header('content-disposition', `attachment; filename="${safeName}"`)
    }
    // A sandboxed, script-free policy keeps an uploaded SVG or HTML-like file inert even if a browser renders it
    // in place. PDFs are excluded because the built-in PDF viewers refuse to run in a sandbox.
    if (media.file.mime !== 'application/pdf') {
      reply.header(
        'content-security-policy',
        "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
      )
    }
    return reply.send(media.body)
  })
  app.get('/integrations/google-sheets/connect', async (request) => {
    if (!request.subject) throw unauthorized()
    const projectId = (request.query as { projectId?: string }).projectId
    if (!projectId) throw badRequest('projectId is required')
    await assertCan(db, request.subject, 'manage_structure', { type: 'project', id: projectId })
    throw new AppError(501, 'not_implemented', 'Google Sheets import is not available. Use an HTTP connector.')
  })
  app.get('/integrations/google-sheets/callback', async (request) => {
    if (!request.subject) throw unauthorized()
    const query = request.query as { code?: string; state?: string }
    if (!query.state) throw unauthorized()
    const state = readState(env, query.state)
    if (request.subject.id !== state.userId) throw unauthorized()
    await assertCan(db, request.subject, 'manage_structure', { type: 'project', id: state.projectId })
    throw new AppError(501, 'not_implemented', 'Google Sheets import is not available. Use an HTTP connector.')
  })
  app.get('/projects/:projectId/connections', async (request) => {
    if (!request.subject) throw unauthorized()
    const projectId = (request.params as { projectId: string }).projectId
    await assertCan(db, request.subject, 'view', { type: 'project', id: projectId })
    return { connections: await publicConnections(db, projectId) }
  })
  app.get('/integrations/:connectionId/history', async (request) => {
    if (!request.subject) throw unauthorized()
    const connectionId = (request.params as { connectionId: string }).connectionId
    await assertConnectionAccess(request.subject, connectionId, 'view')
    return { jobs: await listSyncJobs(db, connectionId) }
  })
  app.post('/integrations/:connectionId/sync', async (request) => {
    if (!request.subject) throw unauthorized()
    await requirePlugin(db, 'google-sheets', 'sync:run')
    const connectionId = (request.params as { connectionId: string }).connectionId
    await assertConnectionAccess(request.subject, connectionId, 'import')
    // Pulling sheet rows is not implemented. Report that instead of recording a sync that imported nothing.
    throw new AppError(501, 'not_implemented', 'Google Sheets import is not available. Use an HTTP connector.')
  })
  app.post('/integrations/:connectionId/webhook', async (request, reply) => {
    const connectionId = (request.params as { connectionId: string }).connectionId
    const secret = await connectionSecret(db, env, connectionId)
    const signature = request.headers['x-datavalley-signature']
    const timestamp = request.headers['x-datavalley-timestamp']
    const body = request.rawBody ?? JSON.stringify(request.body ?? {})
    const first = (value: string | string[] | undefined) =>
      Array.isArray(value) ? value[0] : value
    if (!secret || !verifyWebhook(secret, body, first(signature), first(timestamp))) {
      return reply
        .status(401)
        .send({ error: { code: 'unauthorized', message: 'Invalid or expired webhook signature' } })
    }
    const [connection] = await db
      .select({ pluginId: pluginConnections.pluginId })
      .from(pluginConnections)
      .where(eq(pluginConnections.id, connectionId))
      .limit(1)
    if (connection?.pluginId === 'google-sheets') {
      throw new AppError(501, 'not_implemented', 'Google Sheets import is not available. Use an HTTP connector.')
    }
    throw new AppError(501, 'not_implemented', 'Integration webhooks are not available. Use an HTTP connector.')
  })
}
