import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import * as dataSchema from '../data/schema.js'
import type { FilterNode } from '@datavalley/shared'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { relations } from '../../database/schema.js'
import { badRequest, notFound, unauthorized } from '../../errors.js'
import { assertCan } from '../../security/access.js'
import { writeAudit } from '../../security/audit.js'
import { parseFilterQuery } from '../data/parse-filter.js'
import { publishTableSignal } from '../realtime/publish.js'
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
  requireTable,
} from './service.js'
import { findDuplicateRows } from '../rows/duplicates.js'
import { exportCsv, footer, importCsv, tableSummary } from '../rows/service.js'
import {
  canonicalizeFormatRules,
  compileCondition,
  evaluateStored,
  fillFormulas,
  formulaCatalog,
  formulaDependenciesFor,
  previewFormula,
  readCellFormula,
  saveFormula,
} from '../formulas/service.js'
import { linkRelationRecord } from '../rows/service.js'
import { requirePlugin, deleteView, listViews, renameView, saveView } from '../platform/service.js'

export function registerTableRoutes(app: FastifyInstance, db: AppDatabase, _env: Env) {
  app.get('/projects/:projectId/tables', async (request) => {
    if (!request.subject) throw unauthorized()
    return {
      tables: await listTables(
        db,
        request.subject,
        (request.params as { projectId: string }).projectId,
      ),
    }
  })
  app.post(
    '/projects/:projectId/tables',
    { schema: { body: dataSchema.createTableBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const body = request.body as { name?: string; description?: string; template?: 'demo' }
      return {
        table: await createTable(
          db,
          request.subject,
          (request.params as { projectId: string }).projectId,
          body,
        ),
      }
    },
  )
  app.post(
    '/projects/:projectId/tables/mirror',
    { schema: { body: dataSchema.mirrorTableBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const body = request.body as { sourceTableId: string; name?: string }
      return {
        table: await createTableMirror(
          db,
          request.subject,
          (request.params as { projectId: string }).projectId,
          body,
        ),
      }
    },
  )
  app.put(
    '/projects/:projectId/tables/order',
    { schema: { body: dataSchema.reorderIdsBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const body = request.body as { tableIds: string[] }
      await reorderTables(
        db,
        request.subject,
        (request.params as { projectId: string }).projectId,
        body.tableIds,
      )
      return { ok: true }
    },
  )
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
      table: await createTableFromCsv(
        db,
        request.subject,
        (request.params as { projectId: string }).projectId,
        {
          name,
          csv,
          headerRow,
          delimiter,
        },
      ),
    }
  })
  app.get('/tables/:tableId', async (request) => {
    if (!request.subject) throw unauthorized()
    return {
      table: await getTable(db, request.subject, (request.params as { tableId: string }).tableId),
    }
  })
  app.patch(
    '/tables/:tableId',
    { schema: { body: dataSchema.patchTableBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const tableId = (request.params as { tableId: string }).tableId
      const body = { ...(request.body as Record<string, unknown>) }
      if (body.formatRules !== undefined)
        body.formatRules = await canonicalizeFormatRules(
          db,
          request.subject,
          tableId,
          body.formatRules,
        )
      return { table: await updateTable(db, request.subject, tableId, body as never) }
    },
  )
  app.delete('/tables/:tableId', async (request) => {
    if (!request.subject) throw unauthorized()
    await deleteTable(db, request.subject, (request.params as { tableId: string }).tableId)
    return { ok: true }
  })
  app.post('/tables/:tableId/archive', async (request) => {
    if (!request.subject) throw unauthorized()
    return {
      table: await setTableArchived(
        db,
        request.subject,
        (request.params as { tableId: string }).tableId,
        true,
      ),
    }
  })
  app.post(
    '/tables/:tableId/duplicate',
    { schema: { body: dataSchema.duplicateTableBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const body = request.body as { includeData?: boolean }
      return {
        table: await duplicateTable(
          db,
          request.subject,
          (request.params as { tableId: string }).tableId,
          body.includeData !== false,
        ),
      }
    },
  )
  app.post('/tables/:tableId/lock', async (request) => {
    if (!request.subject) throw unauthorized()
    return {
      table: await lockTable(db, request.subject, (request.params as { tableId: string }).tableId),
    }
  })
  app.post('/tables/:tableId/unlock', async (request) => {
    if (!request.subject) throw unauthorized()
    return {
      table: await unlockTable(
        db,
        request.subject,
        (request.params as { tableId: string }).tableId,
      ),
    }
  })
  app.post(
    '/tables/:tableId/move',
    { schema: { body: dataSchema.moveTableBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const body = request.body as { projectId: string }
      return {
        table: await moveTable(
          db,
          request.subject,
          (request.params as { tableId: string }).tableId,
          body.projectId,
        ),
      }
    },
  )
  app.post('/tables/:tableId/columns', async (request) => {
    if (!request.subject) throw unauthorized()
    return {
      column: await addColumn(
        db,
        request.subject,
        (request.params as { tableId: string }).tableId,
        request.body as never,
      ),
    }
  })
  app.patch('/columns/:columnId', async (request) => {
    if (!request.subject) throw unauthorized()
    return {
      column: await updateColumn(
        db,
        request.subject,
        (request.params as { columnId: string }).columnId,
        request.body as never,
      ),
    }
  })
  app.post(
    '/columns/:columnId/options',
    { schema: { body: dataSchema.columnOptionCreateBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const body = request.body as { label: string }
      const columnId = (request.params as { columnId: string }).columnId
      return { option: await createColumnOption(db, request.subject, columnId, body.label) }
    },
  )
  app.patch(
    '/columns/:columnId/options/:optionId',
    { schema: { body: dataSchema.columnOptionPatchBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const params = request.params as { columnId: string; optionId: string }
      return {
        option: await updateColumnOption(
          db,
          request.subject,
          params.columnId,
          params.optionId,
          request.body as never,
        ),
      }
    },
  )
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
  app.put(
    '/tables/:tableId/columns/order',
    { schema: { body: dataSchema.reorderColumnsBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const body = request.body as { columnIds: string[] }
      await reorderColumns(
        db,
        request.subject,
        (request.params as { tableId: string }).tableId,
        body.columnIds,
      )
      return { ok: true }
    },
  )
  app.post(
    '/columns/:columnId/convert',
    { schema: { body: dataSchema.convertColumnBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const body = request.body as { type: string; dryRun?: boolean }
      return convertColumn(
        db,
        request.subject,
        (request.params as { columnId: string }).columnId,
        body.type,
        body.dryRun === true,
      )
    },
  )
  app.post(
    '/columns/:columnId/relation',
    { schema: { body: dataSchema.relationBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const body = request.body as { toTableId: string; cardinality: string }
      return {
        column: await attachRelation(
          db,
          request.subject,
          (request.params as { columnId: string }).columnId,
          body,
        ),
      }
    },
  )
  app.post(
    '/tables/:tableId/columns/duplicate',
    { schema: { body: dataSchema.duplicateColumnsBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const body = request.body as { columnIds: string[] }
      return {
        columns: await duplicateColumns(
          db,
          request.subject,
          (request.params as { tableId: string }).tableId,
          body.columnIds,
        ),
      }
    },
  )
  app.get('/tables/:tableId/duplicates', async (request) => {
    if (!request.subject) throw unauthorized()
    const query = request.query as { columnId?: string; value?: string; excludeRowId?: string }
    if (!query.columnId) throw badRequest('Choose a column')
    return {
      rows: await findDuplicateRows(
        db,
        request.subject,
        (request.params as { tableId: string }).tableId,
        query.columnId,
        query.value ?? '',
        query.excludeRowId,
      ),
    }
  })
  app.post('/tables/:tableId/tags', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { name: string }
    return {
      tag: await createTag(
        db,
        request.subject,
        (request.params as { tableId: string }).tableId,
        body.name,
      ),
    }
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
    return {
      status: await createStatus(
        db,
        request.subject,
        (request.params as { tableId: string }).tableId,
        body.name,
      ),
    }
  })
  app.patch('/tables/:tableId/statuses/:statusId', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { color?: string; name?: string }
    const params = request.params as { tableId: string; statusId: string }
    return {
      status: await updateStatus(db, request.subject, params.tableId, params.statusId, body),
    }
  })
  app.get('/tables/:tableId/footer', async (request) => {
    if (!request.subject) throw unauthorized()
    const query = request.query as { filter?: string; columns?: string }
    const columnIds =
      query.columns == null
        ? undefined
        : query.columns
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
    return {
      footer: await footer(
        db,
        request.subject,
        (request.params as { tableId: string }).tableId,
        parseFilterQuery(query.filter),
        columnIds,
      ),
    }
  })
  app.get('/tables/:tableId/summary', async (request) => {
    if (!request.subject) throw unauthorized()
    const query = request.query as { filter?: string; dimension?: string; values?: string }
    if (!query.dimension) throw badRequest('Choose a column')
    return tableSummary(db, request.subject, (request.params as { tableId: string }).tableId, {
      dimensionId: query.dimension,
      valueIds: query.values
        ? query.values
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
        : [],
      filter: parseFilterQuery(query.filter),
    })
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
    return importCsv(db, request.subject, (request.params as { tableId: string }).tableId, csv, {
      headerRow,
      delimiter,
    })
  })
  app.post(
    '/tables/:tableId/export',
    { schema: { body: dataSchema.exportTableBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      await requirePlugin(db, 'csv', 'rows:read')
      const body = (request.body ?? {}) as { filter?: FilterNode }
      const result = await exportCsv(
        db,
        request.subject,
        (request.params as { tableId: string }).tableId,
        body.filter,
      )
      return result
    },
  )
  app.get('/tables/:tableId/state', async (request) => {
    if (!request.subject) throw unauthorized()
    return readUserTableState(db, request.subject, (request.params as { tableId: string }).tableId)
  })
  app.put('/tables/:tableId/state', async (request) => {
    if (!request.subject) throw unauthorized()
    return saveUserTableState(
      db,
      request.subject,
      (request.params as { tableId: string }).tableId,
      (request.body ?? {}) as { sort?: unknown; filter?: unknown; display?: unknown },
    )
  })
  app.get('/tables/:tableId/views', async (request) => {
    if (!request.subject) throw unauthorized()
    return {
      views: await listViews(db, request.subject, (request.params as { tableId: string }).tableId),
    }
  })
  app.post('/tables/:tableId/views', async (request) => {
    if (!request.subject) throw unauthorized()
    return {
      view: await saveView(
        db,
        request.subject,
        (request.params as { tableId: string }).tableId,
        request.body as never,
      ),
    }
  })
  app.patch('/tables/:tableId/views/:viewId', async (request) => {
    if (!request.subject) throw unauthorized()
    const params = request.params as { tableId: string; viewId: string }
    const body = request.body as { name?: string }
    return {
      view: await renameView(db, request.subject, params.tableId, params.viewId, body.name ?? ''),
    }
  })
  app.delete('/tables/:tableId/views/:viewId', async (request) => {
    if (!request.subject) throw unauthorized()
    const params = request.params as { tableId: string; viewId: string }
    return deleteView(db, request.subject, params.tableId, params.viewId)
  })
  app.post('/tables/:tableId/conditions/compile', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { expression?: string }
    const canonical = await compileCondition(
      db,
      request.subject,
      (request.params as { tableId: string }).tableId,
      body.expression ?? '',
    )
    return { canonical }
  })
  app.post(
    '/formulas/validate',
    { schema: { body: dataSchema.formulaValidateBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const body = request.body as { tableId: string; expression: string; rowId?: string }
      return previewFormula(db, request.subject, body.tableId, body.expression, body.rowId)
    },
  )
  app.post('/formulas/evaluate', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { formulaId: string; rowId: string }
    const value = await evaluateStored(db, request.subject, body.formulaId, body.rowId)
    await writeAudit(db, request.subject, {
      action: 'formula.evaluate',
      resourceType: 'formula',
      resourceId: body.formulaId,
    })
    return { value }
  })
  app.get('/formulas/:id/dependencies', async (request) => {
    if (!request.subject) throw unauthorized()
    return {
      dependencies: await formulaDependenciesFor(
        db,
        request.subject,
        (request.params as { id: string }).id,
      ),
    }
  })
  app.post('/columns/:columnId/formula', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { expression: string }
    return saveFormula(
      db,
      request.subject,
      (request.params as { columnId: string }).columnId,
      body.expression,
    )
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
    const body = request.body as {
      toTableId: string
      cardinality: string
      name: string
      onDelete?: 'restrict' | 'set_null'
    }
    const table = await requireTable(db, request.subject, params.tableId, 'manage_structure')
    await assertCan(db, request.subject, 'view', {
      type: 'table',
      id: body.toTableId,
      parents: { project: table.projectId },
    })
    const column = await addColumn(db, request.subject, params.tableId, {
      name: body.name,
      type: 'relation',
    })
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
    const [relation] = await db
      .select()
      .from(relations)
      .where(eq(relations.id, (request.params as { id: string }).id))
      .limit(1)
    if (!relation) throw notFound()
    await requireTable(db, request.subject, relation.fromTableId, 'manage_structure')
    await db.delete(relations).where(eq(relations.id, relation.id))
    await publishTableSignal(db, request.subject.id, relation.fromTableId, 'columns.changed')
    return { ok: true }
  })
  app.post('/relations/:id/records', async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { fromRowId: string; toRowId: string }
    return linkRelationRecord(
      db,
      request.subject,
      (request.params as { id: string }).id,
      body.fromRowId,
      body.toRowId,
    )
  })
}
