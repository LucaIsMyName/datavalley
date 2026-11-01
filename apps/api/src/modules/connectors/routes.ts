import type { FastifyInstance } from 'fastify'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { unauthorized } from '../../errors.js'
import {
  bindConnectorToTable,
  connectorHistory,
  createConnector,
  createTableFromConnector,
  deleteConnector,
  getConnector,
  getTableBinding,
  listConnectors,
  patchTableBinding,
  previewConnector,
  queueConnectorSync,
  updateConnector,
} from './service.js'
import {
  connectorIdParams,
  createConnectorBody,
  fromConnectorBody,
  listConnectorsQuery,
  patchBindingBody,
  patchConnectorBody,
  previewConnectorBody,
  syncConnectorBody,
  bindConnectorBody,
  tableIdParams,
} from './schema.js'

export function registerConnectorRoutes(app: FastifyInstance, db: AppDatabase, env: Env) {
  app.get('/connectors', { schema: { querystring: listConnectorsQuery } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const query = request.query as { projectId?: string }
    return { connectors: await listConnectors(db, request.subject, query.projectId) }
  })

  app.post('/connectors', { schema: { body: createConnectorBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    return { connector: await createConnector(db, env, request.subject, request.body as never) }
  })

  app.get('/connectors/:id', { schema: { params: connectorIdParams } }, async (request) => {
    if (!request.subject) throw unauthorized()
    return { connector: await getConnector(db, request.subject, (request.params as { id: string }).id) }
  })

  app.patch('/connectors/:id', { schema: { params: connectorIdParams, body: patchConnectorBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    return { connector: await updateConnector(db, env, request.subject, (request.params as { id: string }).id, request.body as never) }
  })

  app.delete('/connectors/:id', { schema: { params: connectorIdParams } }, async (request) => {
    if (!request.subject) throw unauthorized()
    return deleteConnector(db, request.subject, (request.params as { id: string }).id)
  })

  app.post('/connectors/:id/preview', { schema: { params: connectorIdParams, body: previewConnectorBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = (request.body ?? {}) as { limit?: number }
    return previewConnector(db, env, request.subject, (request.params as { id: string }).id, body.limit ?? 10)
  })

  app.post('/connectors/:id/sync', { schema: { params: connectorIdParams, body: syncConnectorBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = (request.body ?? {}) as { tableId?: string }
    return queueConnectorSync(db, env, request.subject, (request.params as { id: string }).id, body.tableId)
  })

  app.post('/connectors/:id/bind-table', { schema: { params: connectorIdParams, body: bindConnectorBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const params = request.params as { id: string }
    const body = request.body as { tableId: string }
    return bindConnectorToTable(db, env, request.subject, params.id, body.tableId)
  })

  app.get('/connectors/:id/history', { schema: { params: connectorIdParams } }, async (request) => {
    if (!request.subject) throw unauthorized()
    return { jobs: await connectorHistory(db, request.subject, (request.params as { id: string }).id) }
  })

  app.get('/tables/:tableId/binding', { schema: { params: tableIdParams } }, async (request) => {
    if (!request.subject) throw unauthorized()
    return { binding: await getTableBinding(db, request.subject, (request.params as { tableId: string }).tableId) }
  })

  app.patch('/tables/:tableId/binding', { schema: { params: tableIdParams, body: patchBindingBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    return { binding: await patchTableBinding(db, request.subject, (request.params as { tableId: string }).tableId, request.body as never) }
  })
}

export function registerProjectConnectorRoutes(app: FastifyInstance, db: AppDatabase, env: Env) {
  app.post('/projects/:projectId/tables/from-connector', { schema: { body: fromConnectorBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const params = request.params as { projectId: string }
    return createTableFromConnector(db, env, request.subject, params.projectId, request.body as never)
  })
}
