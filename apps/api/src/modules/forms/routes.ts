import type { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import type { AppDatabase } from '../../database/client.js'
import { unauthorized } from '../../errors.js'
import { deletePublicForm, publicFormFields, readPublicForm, savePublicForm, submitPublicForm } from './service.js'

const saveBody = Type.Object({
  columnIds: Type.Array(Type.String({ minLength: 36, maxLength: 36 }), { minItems: 1, maxItems: 24 }),
})

const submitBody = Type.Object({
  cells: Type.Record(Type.String(), Type.Unknown()),
})

export function registerFormRoutes(app: FastifyInstance, db: AppDatabase) {
  app.get('/tables/:tableId/form', async (request) => {
    if (!request.subject) throw unauthorized()
    return readPublicForm(db, request.subject, (request.params as { tableId: string }).tableId)
  })
  app.put('/tables/:tableId/form', { schema: { body: saveBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { columnIds: string[] }
    return { form: await savePublicForm(db, request.subject, (request.params as { tableId: string }).tableId, body.columnIds) }
  })
  app.delete('/tables/:tableId/form', async (request) => {
    if (!request.subject) throw unauthorized()
    await deletePublicForm(db, request.subject, (request.params as { tableId: string }).tableId)
    return { ok: true }
  })
  app.get('/public/forms/:token', async (request) => {
    return publicFormFields(db, (request.params as { token: string }).token)
  })
  app.post(
    '/public/forms/:token',
    { schema: { body: submitBody }, config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request) => {
      const body = request.body as { cells: Record<string, unknown> }
      return submitPublicForm(db, (request.params as { token: string }).token, body.cells ?? {})
    },
  )
}
