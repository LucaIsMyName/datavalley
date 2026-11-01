import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { isImageMime } from '../../security/media-mime.js'
import * as dataSchema from './schema.js'
import type { FilterNode, FormatRule } from '@datavalley/shared'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { relations, relationRecords, userFavorites } from '../../database/schema.js'
import { listFavoriteHits, listRecentHits } from './library.js'
import { badRequest, conflict, notFound, unauthorized } from '../../errors.js'
import { assertCan } from '../../security/access.js'
import { writeAudit } from '../../security/audit.js'
import {
  addColumn,
  attachRelation,
  convertColumn,
  createColumnOption,
  createStatus,
  createTag,
  deleteColumnOption,
  duplicateColumns,
  deleteColumn,
  deleteTable,
  duplicateTable,
  getTable,
  listTables,
  moveTable,
  reorderColumns,
  readUserTableState,
  saveUserTableState,
  createTable,
  createTableFromCsv,
  createTableMirror,
  lockTable,
  unlockTable,
  reorderTables,
  setTableArchived,
  updateColumn,
  updateColumnOption,
  updateStatus,
  updateTable,
  updateTag,
} from '../tables/service.js'
import { bulkDelete, bulkPatch, createRow, deleteRow, duplicateRows, exportCsv, fillDown, footer, importCsv, listRows, moveRow, patchRow } from '../rows/service.js'
import { canonicalizeFormatRules, compileCondition, evaluateStored, fillFormulas, formulaCatalog, formulaDependenciesFor, previewFormula, readCellFormula, saveFormula } from '../formulas/service.js'
import { requireTable } from '../tables/service.js'
import {
  configurePlugin,
  confirmTotp,
  connectionSecret,
  createApiKey,
  disableTotp,
  enrollTotp,
  googleAuthUrl,
  listApiKeys,
  listAudit,
  listNotifications,
  listPlugins,
  listSyncJobs,
  listViews,
  getMediaDetails,
  listMedia,
  markNotificationRead,
  publicConnections,
  readMedia,
  readState,
  recordSync,
  requirePlugin,
  revokeApiKey,
  rotateApiKey,
  saveGoogleConnection,
  saveView,
  setPluginEnabled,
  signState,
  storeMedia,
  verifyWebhook,
} from '../platform/service.js'

export function registerDataRoutes(app: FastifyInstance, db: AppDatabase, env: Env) {
  app.get('/projects/:projectId/tables', async (request) => {
    if (!request.subject) throw unauthorized()
    return { tables: await listTables(db, request.subject, (request.params as { projectId: string }).projectId) }
  })
  app.post('/projects/:projectId/tables', { schema: { body: dataSchema.createTableBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { name?: string; description?: string; template?: 'demo' }
    return { table: await createTable(db, request.subject, (request.params as { projectId: string }).projectId, body) }
  })
  app.post('/projects/:projectId/tables/mirror', { schema: { body: dataSchema.mirrorTableBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { sourceTableId: string; name?: string }
    return {
      table: await createTableMirror(db, request.subject, (request.params as { projectId: string }).projectId, body),
    }
  })
  app.put('/projects/:projectId/tables/order', { schema: { body: dataSchema.reorderIdsBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { tableIds: string[] }
    await reorderTables(db, request.subject, (request.params as { projectId: string }).projectId, body.tableIds)
    return { ok: true }
  })
  app.post('/projects/:projectId/tables/import', async (request) => {
    if (!request.subject) throw unauthorized()
    let csv = ''
    let name = ''
    let headerRow = true
    let delimiter: string | undefined
    for await (const part of request.parts()) {
      if (part.type === 'file') csv = (await part.toBuffer()).toString('utf8')
      else if (part.fieldname === 'name') name = String(part.value ?? '')
      else if (part.fieldname === 'headerRow') headerRow = String(part.value) !== 'false'
      else if (part.fieldname === 'delimiter') delimiter = String(part.value ?? '')
    }
    return {
      table: await createTableFromCsv(db, request.subject, (request.params as { projectId: string }).projectId, {
        name,
        csv,
        headerRow,
        delimiter,
      }),
    }
  })
  app.get('/tables/:tableId', async (request) => {
    if (!request.subject) throw unauthorized()
    return { table: await getTable(db, request.subject, (request.params as { tableId: string }).tableId) }
  })
  app.patch('/tables/:tableId', { schema: { body: dataSchema.patchTableBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const tableId = (request.params as { tableId: string }).tableId
    const body = { ...(request.body as Record<string, unknown>) }
    if (body.formatRules !== undefined) body.formatRules = await canonicalizeFormatRules(db, request.subject, tableId, body.formatRules)
    return { table: await updateTable(db, request.subject, tableId, body as never) }
  })
  app.delete('/tables/:tableId', async (request) => {
    if (!request.subject) throw unauthorized()
    await deleteTable(db, request.subject, (request.params as { tableId: string }).tableId)
    return { ok: true }
  })
  app.post('/tables/:tableId/archive', async (request) => {
    if (!request.subject) throw unauthorized()
    return { table: await setTableArchived(db, request.subject, (request.params as { tableId: string }).tableId, true) }
  })
  app.post('/tables/:tableId/duplicate', { schema: { body: dataSchema.duplicateTableBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { includeData?: boolean }
    return { table: await duplicateTable(db, request.subject, (request.params as { tableId: string }).tableId, body.includeData !== false) }
  })
  app.post('/tables/:tableId/lock', async (request) => {
    if (!request.subject) throw unauthorized()
    return { table: await lockTable(db, request.subject, (request.params as { tableId: string }).tableId) }
  })
  app.post('/tables/:tableId/unlock', async (request) => {
    if (!request.subject) throw unauthorized()
    return { table: await unlockTable(db, request.subject, (request.params as { tableId: string }).tableId) }
  })
  app.post('/tables/:tableId/move', { schema: { body: dataSchema.moveTableBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { projectId: string }
    return { table: await moveTable(db, request.subject, (request.params as { tableId: string }).tableId, body.projectId) }
  })
  app.post('/tables/:tableId/columns', async (request) => {
    if (!request.subject) throw unauthorized()
    return { column: await addColumn(db, request.subject, (request.params as { tableId: string }).tableId, request.body as never) }
  })
  app.patch('/columns/:columnId', async (request) => {
    if (!request.subject) throw unauthorized()
    return { column: await updateColumn(db, request.subject, (request.params as { columnId: string }).columnId, request.body as never) }
  })
  app.post('/columns/:columnId/options', { schema: { body: dataSchema.columnOptionCreateBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { label: string }
    const columnId = (request.params as { columnId: string }).columnId
    return { option: await createColumnOption(db, request.subject, columnId, body.label) }
  })
  app.patch('/columns/:columnId/options/:optionId', { schema: { body: dataSchema.columnOptionPatchBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const params = request.params as { columnId: string; optionId: string }
    return { option: await updateColumnOption(db, request.subject, params.columnId, params.optionId, request.body as never) }
  })
  app.delete('/columns/:columnId/options/:optionId', async (request) => {
    if (!request.subject) throw unauthorized()
    const params = request.params as { columnId: string; optionId: string }
    return await deleteColumnOption(db, request.subject, params.columnId, params.optionId)
  })
  app.delete('/columns/:columnId', async (request) => {
    if (!request.subject) throw unauthorized()
    await deleteColumn(db, request.subject, (request.params as { columnId: string }).columnId)
    return { ok: true }
  })
  app.put('/tables/:tableId/columns/order', { schema: { body: dataSchema.reorderColumnsBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { columnIds: string[] }
    await reorderColumns(db, request.subject, (request.params as { tableId: string }).tableId, body.columnIds)
    return { ok: true }
  })
  app.post('/columns/:columnId/convert', { schema: { body: dataSchema.convertColumnBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { type: string; dryRun?: boolean }
    return convertColumn(db, request.subject, (request.params as { columnId: string }).columnId, body.type, body.dryRun === true)
  })
  app.post('/columns/:columnId/relation', { schema: { body: dataSchema.relationBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { toTableId: string; cardinality: string }
    return { column: await attachRelation(db, request.subject, (request.params as { columnId: string }).columnId, body) }
  })
  app.post('/tables/:tableId/columns/duplicate', { schema: { body: dataSchema.duplicateColumnsBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { columnIds: string[] }
    return { columns: await duplicateColumns(db, request.subject, (request.params as { tableId: string }).tableId, body.columnIds) }
  })
  app.get('/tables/:tableId/rows', async (request) => {
    if (!request.subject) throw unauthorized()
    const query = request.query as { limit?: string; cursor?: string; q?: string; sort?: string; direction?: string; filter?: string }
    let filter: FilterNode | null = null
    if (query.filter) filter = JSON.parse(query.filter) as FilterNode
    return listRows(db, request.subject, (request.params as { tableId: string }).tableId, {
      limit: query.limit ? Number(query.limit) : 50,
      cursor: query.cursor,
      q: query.q,
      sort: query.sort ? { columnId: query.sort, direction: query.direction === 'desc' ? 'desc' : 'asc' } : null,
      filter,
    })
  })
  app.post('/tables/:tableId/rows', { schema: { body: dataSchema.createRowBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { cells?: Record<string, unknown>; beforeId?: string; afterId?: string }
    return {
      row: await createRow(db, request.subject, (request.params as { tableId: string }).tableId, body.cells ?? {}, {
        beforeId: body.beforeId,
        afterId: body.afterId,
      }),
    }
  })
  app.post('/tables/:tableId/rows/move', { schema: { body: dataSchema.moveRowBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { rowId: string; beforeId?: string; afterId?: string }
    return { row: await moveRow(db, request.subject, (request.params as { tableId: string }).tableId, body.rowId, body) }
  })
  app.patch('/rows/:rowId', { schema: { body: dataSchema.patchRowBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { version: number; cells?: Record<string, unknown>; color?: string | null; backgrounds?: Record<string, string | null>; formats?: Record<string, FormatRule[]>; notes?: string }
    return { row: await patchRow(db, request.subject, (request.params as { rowId: string }).rowId, body) }
  })
  app.delete('/rows/:rowId', async (request) => {
    if (!request.subject) throw unauthorized()
    await deleteRow(db, request.subject, (request.params as { rowId: string }).rowId)
    return { ok: true }
  })
  app.patch('/tables/:tableId/cells/bulk', { schema: { body: dataSchema.bulkPatchBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { updates: { rowId: string; version: number; cells: Record<string, unknown> }[] }
    await bulkPatch(db, request.subject, (request.params as { tableId: string }).tableId, body.updates)
    return { ok: true }
  })
  app.post('/tables/:tableId/rows/bulk-delete', { schema: { body: dataSchema.rowIdsBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { rowIds: string[] }
    await bulkDelete(db, request.subject, (request.params as { tableId: string }).tableId, body.rowIds)
    return { ok: true }
  })
  app.post('/tables/:tableId/rows/duplicate', { schema: { body: dataSchema.rowIdsBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { rowIds: string[] }
    return { rowIds: await duplicateRows(db, request.subject, (request.params as { tableId: string }).tableId, body.rowIds) }
  })
  app.post('/tables/:tableId/fill', { schema: { body: dataSchema.fillDownBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    await fillDown(db, request.subject, (request.params as { tableId: string }).tableId, request.body as { columnId: string; rowIds: string[] })
    return { ok: true }
  })
  app.post('/tables/:tableId/tags', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { name: string }
    return { tag: await createTag(db, request.subject, (request.params as { tableId: string }).tableId, body.name) }
  })
  app.patch('/tables/:tableId/tags/:tagId', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { color?: string; name?: string }
    const params = request.params as { tableId: string; tagId: string }
    return { tag: await updateTag(db, request.subject, params.tableId, params.tagId, body) }
  })
  app.post('/tables/:tableId/statuses', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { name: string }
    return { status: await createStatus(db, request.subject, (request.params as { tableId: string }).tableId, body.name) }
  })
  app.patch('/tables/:tableId/statuses/:statusId', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { color?: string; name?: string }
    const params = request.params as { tableId: string; statusId: string }
    return { status: await updateStatus(db, request.subject, params.tableId, params.statusId, body) }
  })
  app.get('/tables/:tableId/footer', async (request) => {
    if (!request.subject) throw unauthorized()
    const query = request.query as { filter?: string }
    return { footer: await footer(db, request.subject, (request.params as { tableId: string }).tableId, query.filter ? JSON.parse(query.filter) : null) }
  })
  app.post('/tables/:tableId/import', async (request) => {
    if (!request.subject) throw unauthorized()
    await requirePlugin(db, 'csv', 'rows:write')
    let csv = ''
    let headerRow = true
    let delimiter: string | undefined
    for await (const part of request.parts()) {
      if (part.type === 'file') csv = (await part.toBuffer()).toString('utf8')
      else if (part.fieldname === 'headerRow') headerRow = String(part.value) !== 'false'
      else if (part.fieldname === 'delimiter') delimiter = String(part.value ?? '')
    }
    if (!csv) throw badRequest('Choose a CSV file')
    return importCsv(db, request.subject, (request.params as { tableId: string }).tableId, csv, { headerRow, delimiter })
  })
  app.post('/tables/:tableId/export', { schema: { body: dataSchema.exportTableBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    await requirePlugin(db, 'csv', 'rows:read')
    const body = (request.body ?? {}) as { filter?: FilterNode }
    const result = await exportCsv(db, request.subject, (request.params as { tableId: string }).tableId, body.filter)
    return result
  })
  app.get('/tables/:tableId/state', async (request) => {
    if (!request.subject) throw unauthorized()
    return readUserTableState(db, request.subject, (request.params as { tableId: string }).tableId)
  })
  app.put('/tables/:tableId/state', async (request) => {
    if (!request.subject) throw unauthorized()
    return saveUserTableState(db, request.subject, (request.params as { tableId: string }).tableId, (request.body ?? {}) as { sort?: unknown; filter?: unknown; display?: unknown })
  })
  app.get('/tables/:tableId/views', async (request) => {
    if (!request.subject) throw unauthorized()
    return { views: await listViews(db, request.subject, (request.params as { tableId: string }).tableId) }
  })
  app.post('/tables/:tableId/views', async (request) => {
    if (!request.subject) throw unauthorized()
    return { view: await saveView(db, request.subject, (request.params as { tableId: string }).tableId, request.body as never) }
  })
  app.post('/tables/:tableId/conditions/compile', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { expression?: string }
    const canonical = await compileCondition(db, request.subject, (request.params as { tableId: string }).tableId, body.expression ?? '')
    return { canonical }
  })
  app.post('/formulas/validate', { schema: { body: dataSchema.formulaValidateBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { tableId: string; expression: string; rowId?: string }
    return previewFormula(db, request.subject, body.tableId, body.expression, body.rowId)
  })
  app.post('/formulas/evaluate', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { formulaId: string; rowId: string }
    const value = await evaluateStored(db, request.subject, body.formulaId, body.rowId)
    await writeAudit(db, request.subject, { action: 'formula.evaluate', resourceType: 'formula', resourceId: body.formulaId })
    return { value }
  })
  app.get('/formulas/:id/dependencies', async (request) => {
    if (!request.subject) throw unauthorized()
    return { dependencies: await formulaDependenciesFor(db, request.subject, (request.params as { id: string }).id) }
  })
  app.post('/columns/:columnId/formula', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { expression: string }
    return saveFormula(db, request.subject, (request.params as { columnId: string }).columnId, body.expression)
  })
  app.get('/rows/:rowId/columns/:columnId/formula', async (request) => {
    if (!request.subject) throw unauthorized()
    const params = request.params as { rowId: string; columnId: string }
    return readCellFormula(db, request.subject, params.rowId, params.columnId)
  })
  app.post('/rows/:rowId/columns/:columnId/formula', async (request) => {
    if (!request.subject) throw unauthorized()
    const params = request.params as { rowId: string; columnId: string }
    const body = request.body as { expression: string }
    return saveFormula(db, request.subject, params.columnId, body.expression, params.rowId)
  })
  app.post('/tables/:tableId/formulas/fill', async (request) => {
    if (!request.subject) throw unauthorized()
    const params = request.params as { tableId: string }
    const body = request.body as { columnId: string; sourceRowId: string; rowIds: string[] }
    return fillFormulas(db, request.subject, params.tableId, body)
  })
  app.get('/tables/:tableId/formula-catalog', async (request) => {
    if (!request.subject) throw unauthorized()
    return formulaCatalog(db, request.subject, (request.params as { tableId: string }).tableId)
  })
  app.post('/tables/:tableId/relations', async (request) => {
    if (!request.subject) throw unauthorized()
    const params = request.params as { tableId: string }
    const body = request.body as { toTableId: string; cardinality: string; name: string; onDelete?: 'restrict' | 'set_null' }
    const table = await requireTable(db, request.subject, params.tableId, 'manage_structure')
    await assertCan(db, request.subject, 'view', { type: 'table', id: body.toTableId, parents: { project: table.projectId } })
    const column = await addColumn(db, request.subject, params.tableId, { name: body.name, type: 'relation' })
    const [relation] = await db
      .insert(relations)
      .values({
        fromTableId: params.tableId,
        toTableId: body.toTableId,
        fromColumnId: column.id,
        cardinality: body.cardinality,
        onDelete: body.onDelete ?? 'restrict',
      })
      .returning()
    const saved = await updateColumn(db, request.subject, column.id, {
      config: { relationId: relation.id, toTableId: body.toTableId },
    })
    return { relation: { ...relation, column: saved } }
  })
  app.delete('/relations/:id', async (request) => {
    if (!request.subject) throw unauthorized()
    const [relation] = await db.select().from(relations).where(eq(relations.id, (request.params as { id: string }).id)).limit(1)
    if (!relation) throw notFound()
    await requireTable(db, request.subject, relation.fromTableId, 'manage_structure')
    await db.delete(relations).where(eq(relations.id, relation.id))
    return { ok: true }
  })
  app.post('/relations/:id/records', async (request) => {
    if (!request.subject) throw unauthorized()
    const [relation] = await db.select().from(relations).where(eq(relations.id, (request.params as { id: string }).id)).limit(1)
    if (!relation) throw notFound()
    const body = request.body as { fromRowId: string; toRowId: string }
    await requireTable(db, request.subject, relation.fromTableId, 'edit')
    const [target] = await db.select().from(relationRecords).where(and(eq(relationRecords.relationId, relation.id), eq(relationRecords.toRowId, body.toRowId)))
    if ((relation.cardinality === 'one_to_one' || relation.cardinality === 'one_to_many') && target) throw conflict('That record is already linked')
    await db.insert(relationRecords).values({ relationId: relation.id, fromRowId: body.fromRowId, toRowId: body.toRowId })
    return { ok: true }
  })
  app.get('/favorites', async (request) => {
    if (!request.subject) throw unauthorized()
    return { favorites: await listFavoriteHits(db, request.subject) }
  })
  app.post('/favorites', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { resourceType: string; resourceId: string }
    await db.insert(userFavorites).values({ userId: request.subject.id, resourceType: body.resourceType, resourceId: body.resourceId }).onConflictDoNothing()
    return { ok: true }
  })
  app.delete('/favorites', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { resourceType: string; resourceId: string }
    await db.delete(userFavorites).where(and(eq(userFavorites.userId, request.subject.id), eq(userFavorites.resourceType, body.resourceType), eq(userFavorites.resourceId, body.resourceId)))
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
    return { plugin: await setPluginEnabled(db, request.subject, (request.params as { id: string }).id, true) }
  })
  app.post('/plugins/:id/disable', async (request) => {
    if (!request.subject) throw unauthorized()
    return { plugin: await setPluginEnabled(db, request.subject, (request.params as { id: string }).id, false) }
  })
  app.post('/plugins/:id/configure', async (request) => {
    if (!request.subject) throw unauthorized()
    return configurePlugin(db, request.subject, (request.params as { id: string }).id, (request.body as { config: Record<string, unknown> }).config)
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
    return { apiKey: await rotateApiKey(db, request.subject, (request.params as { id: string }).id) }
  })
  app.delete('/api-keys/:id', async (request) => {
    if (!request.subject) throw unauthorized()
    await revokeApiKey(db, request.subject, (request.params as { id: string }).id)
    return { ok: true }
  })
  app.get('/audit', async (request) => {
    if (!request.subject) throw unauthorized()
    return listAudit(db, request.subject, request.query as never)
  })
  app.get('/notifications', async (request) => {
    if (!request.subject?.user) throw unauthorized()
    return { notifications: await listNotifications(db, request.subject.id) }
  })
  app.post('/notifications/:id/read', async (request) => {
    if (!request.subject?.user) throw unauthorized()
    await markNotificationRead(db, request.subject.id, (request.params as { id: string }).id)
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
    const query = request.query as { limit?: string; cursor?: string; q?: string; mime?: 'image' | 'pdf' }
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
      file: await storeMedia(db, env, request.subject, { tableId: tableId ?? null }, {
        filename: file.filename,
        mimetype: file.mimetype,
        buffer: await file.toBuffer(),
      }),
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
    return reply.send(media.body)
  })
  app.get('/integrations/google-sheets/connect', async (request, reply) => {
    if (!request.subject) throw unauthorized()
    const projectId = (request.query as { projectId?: string }).projectId
    if (!projectId) throw badRequest('projectId is required')
    const state = signState(env, { projectId, userId: request.subject.id })
    return reply.redirect(googleAuthUrl(env, state))
  })
  app.get('/integrations/google-sheets/callback', async (request) => {
    const query = request.query as { code?: string; state?: string }
    if (!query.state) throw unauthorized()
    const state = readState(env, query.state)
    if (!query.code) throw badRequest('Missing OAuth code')
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: query.code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })
    if (!response.ok) throw badRequest('Google token exchange failed')
    const tokens = await response.json()
    return { connection: await saveGoogleConnection(db, env, state.projectId, tokens) }
  })
  app.get('/projects/:projectId/connections', async (request) => {
    if (!request.subject) throw unauthorized()
    return { connections: await publicConnections(db, (request.params as { projectId: string }).projectId) }
  })
  app.get('/integrations/:connectionId/history', async (request) => {
    if (!request.subject) throw unauthorized()
    return { jobs: await listSyncJobs(db, (request.params as { connectionId: string }).connectionId) }
  })
  app.post('/integrations/:connectionId/sync', async (request) => {
    if (!request.subject) throw unauthorized()
    await requirePlugin(db, 'google-sheets', 'sync:run')
    const connectionId = (request.params as { connectionId: string }).connectionId
    const secret = await connectionSecret(db, env, connectionId)
    if (!secret) throw badRequest('Connection has no credentials')
    const job = await recordSync(db, connectionId, 'completed', undefined, { imported: 0, note: 'Manual sync recorded' })
    return { job }
  })
  app.post('/integrations/:connectionId/webhook', async (request, reply) => {
    const connectionId = (request.params as { connectionId: string }).connectionId
    const secret = await connectionSecret(db, env, connectionId)
    const signature = request.headers['x-datavalley-signature']
    if (!secret || !verifyWebhook(secret, request.rawBody ?? JSON.stringify(request.body ?? {}), Array.isArray(signature) ? signature[0] : signature)) {
      return reply.status(401).send({ error: { code: 'unauthorized', message: 'Invalid webhook signature' } })
    }
    const job = await recordSync(db, connectionId, 'queued', undefined, { webhook: true })
    return { jobId: job.id }
  })
}

void conflict
