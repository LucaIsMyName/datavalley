import type { FastifyInstance } from 'fastify'
import * as dataSchema from '../data/schema.js'
import type { FormatRule } from '@datavalley/shared'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { unauthorized } from '../../errors.js'
import { parseFilterQuery } from '../data/parse-filter.js'
import { sendPdf } from '../data/send-pdf.js'
import {
  bulkDelete,
  bulkPatch,
  createRow,
  deleteRow,
  duplicateRows,
  fillDown,
  getRecord,
  listRows,
  moveRow,
  patchRow,
} from './service.js'
import { listFieldHistory } from './history.js'
import { exportPerson, removePerson } from './privacy.js'
import { quotePdf, recordPdf } from './pdf.js'
import { quoteSummary } from './quote.js'

export function registerRowRoutes(app: FastifyInstance, db: AppDatabase, env: Env) {
  app.get('/tables/:tableId/rows', async (request) => {
    if (!request.subject) throw unauthorized()
    const query = request.query as {
      limit?: string
      cursor?: string
      q?: string
      sort?: string
      direction?: string
      filter?: string
    }
    const filter = parseFilterQuery(query.filter)
    return listRows(db, request.subject, (request.params as { tableId: string }).tableId, {
      limit: query.limit ? Number(query.limit) : 50,
      cursor: query.cursor,
      q: query.q,
      sort: query.sort
        ? { columnId: query.sort, direction: query.direction === 'desc' ? 'desc' : 'asc' }
        : null,
      filter,
    })
  })
  app.post(
    '/tables/:tableId/rows',
    { schema: { body: dataSchema.createRowBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const body = request.body as {
        cells?: Record<string, unknown>
        beforeId?: string
        afterId?: string
      }
      return {
        row: await createRow(
          db,
          request.subject,
          (request.params as { tableId: string }).tableId,
          body.cells ?? {},
          {
            beforeId: body.beforeId,
            afterId: body.afterId,
          },
          true,
          env,
        ),
      }
    },
  )
  app.post(
    '/tables/:tableId/rows/move',
    { schema: { body: dataSchema.moveRowBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const body = request.body as { rowId: string; beforeId?: string; afterId?: string }
      return {
        row: await moveRow(
          db,
          request.subject,
          (request.params as { tableId: string }).tableId,
          body.rowId,
          body,
        ),
      }
    },
  )
  app.get('/rows/:rowId/record', async (request) => {
    if (!request.subject) throw unauthorized()
    return getRecord(db, request.subject, (request.params as { rowId: string }).rowId)
  })
  app.get('/rows/:rowId/history', async (request) => {
    if (!request.subject) throw unauthorized()
    return {
      entries: await listFieldHistory(
        db,
        request.subject,
        (request.params as { rowId: string }).rowId,
      ),
    }
  })
  app.get('/rows/:rowId/quote', async (request) => {
    if (!request.subject) throw unauthorized()
    return quoteSummary(db, request.subject, (request.params as { rowId: string }).rowId)
  })
  app.get('/rows/:rowId/pdf', async (request, reply) => {
    if (!request.subject) throw unauthorized()
    const file = await recordPdf(db, request.subject, (request.params as { rowId: string }).rowId)
    return sendPdf(reply, file)
  })
  app.get('/rows/:rowId/quote.pdf', async (request, reply) => {
    if (!request.subject) throw unauthorized()
    const file = await quotePdf(db, request.subject, (request.params as { rowId: string }).rowId)
    return sendPdf(reply, file)
  })
  app.get('/rows/:rowId/privacy', async (request) => {
    if (!request.subject) throw unauthorized()
    return exportPerson(db, request.subject, (request.params as { rowId: string }).rowId)
  })
  app.delete('/rows/:rowId/privacy', async (request) => {
    if (!request.subject) throw unauthorized()
    return removePerson(db, request.subject, (request.params as { rowId: string }).rowId)
  })
  app.patch('/rows/:rowId', { schema: { body: dataSchema.patchRowBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as {
      version: number
      cells?: Record<string, unknown>
      color?: string | null
      backgrounds?: Record<string, string | null>
      formats?: Record<string, FormatRule[]>
      notes?: string
    }
    return {
      row: await patchRow(
        db,
        request.subject,
        (request.params as { rowId: string }).rowId,
        body,
        env,
      ),
    }
  })
  app.delete('/rows/:rowId', async (request) => {
    if (!request.subject) throw unauthorized()
    await deleteRow(db, request.subject, (request.params as { rowId: string }).rowId)
    return { ok: true }
  })
  app.patch(
    '/tables/:tableId/cells/bulk',
    { schema: { body: dataSchema.bulkPatchBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const body = request.body as {
        updates: { rowId: string; version: number; cells: Record<string, unknown> }[]
      }
      const rows = await bulkPatch(
        db,
        request.subject,
        (request.params as { tableId: string }).tableId,
        body.updates,
        env,
      )
      return { rows }
    },
  )
  app.post(
    '/tables/:tableId/rows/bulk-delete',
    { schema: { body: dataSchema.rowIdsBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const body = request.body as { rowIds: string[] }
      const notes = await bulkDelete(
        db,
        request.subject,
        (request.params as { tableId: string }).tableId,
        body.rowIds,
      )
      return { ok: true, notes }
    },
  )
  app.post(
    '/tables/:tableId/rows/duplicate',
    { schema: { body: dataSchema.rowIdsBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const body = request.body as { rowIds: string[] }
      return duplicateRows(
        db,
        request.subject,
        (request.params as { tableId: string }).tableId,
        body.rowIds,
      )
    },
  )
  app.post(
    '/tables/:tableId/fill',
    { schema: { body: dataSchema.fillDownBody } },
    async (request) => {
      if (!request.subject) throw unauthorized()
      await fillDown(
        db,
        request.subject,
        (request.params as { tableId: string }).tableId,
        request.body as { columnId: string; rowIds: string[]; versions?: Record<string, number> },
      )
      return { ok: true }
    },
  )
}
