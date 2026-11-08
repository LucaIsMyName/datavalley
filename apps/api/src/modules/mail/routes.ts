import type { FastifyInstance } from 'fastify'
import { Type } from '@sinclair/typebox'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { unauthorized } from '../../errors.js'
import {
  createMailTemplate,
  deleteMailTemplate,
  listMailTemplates,
  listRowMail,
  sendRowMail,
  updateMailTemplate,
} from './service.js'

const templateBody = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 120 }),
  subject: Type.String({ maxLength: 500 }),
  body: Type.String({ maxLength: 20000 }),
})

const sendBody = Type.Object({
  to: Type.String({ minLength: 3, maxLength: 320 }),
  subject: Type.String({ maxLength: 500 }),
  body: Type.String({ maxLength: 20000 }),
  templateId: Type.Optional(Type.Union([Type.String({ minLength: 36, maxLength: 36 }), Type.Null()])),
})

export function registerMailRoutes(app: FastifyInstance, db: AppDatabase, env: Env) {
  app.get('/mail/templates', async (request) => {
    if (!request.subject) throw unauthorized()
    return { templates: await listMailTemplates(db, request.subject) }
  })
  app.post('/mail/templates', { schema: { body: templateBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { name: string; subject: string; body: string }
    return { template: await createMailTemplate(db, request.subject, body) }
  })
  app.patch('/mail/templates/:templateId', { schema: { body: templateBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { name: string; subject: string; body: string }
    const template = await updateMailTemplate(
      db,
      request.subject,
      (request.params as { templateId: string }).templateId,
      body,
    )
    return { template }
  })
  app.delete('/mail/templates/:templateId', async (request) => {
    if (!request.subject) throw unauthorized()
    await deleteMailTemplate(db, request.subject, (request.params as { templateId: string }).templateId)
    return { ok: true }
  })
  app.get('/rows/:rowId/mail', async (request) => {
    if (!request.subject) throw unauthorized()
    return listRowMail(db, request.subject, (request.params as { rowId: string }).rowId)
  })
  app.post('/rows/:rowId/mail', { schema: { body: sendBody } }, async (request) => {
    if (!request.subject) throw unauthorized()
    const body = request.body as { to: string; subject: string; body: string; templateId?: string | null }
    return sendRowMail(db, env, request.subject, (request.params as { rowId: string }).rowId, body)
  })
}
