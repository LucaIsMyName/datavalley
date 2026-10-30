import { Type } from '@sinclair/typebox'
import type { FastifyInstance } from 'fastify'
import type { AppDatabase } from '../../database/client.js'
import { unauthorized } from '../../errors.js'
import { search } from './service.js'

export function registerSearchRoutes(app: FastifyInstance, db: AppDatabase) {
  app.get(
    '/search',
    {
      schema: {
        querystring: Type.Object({
          q: Type.Optional(Type.String()),
          locale: Type.Optional(Type.Union([Type.Literal('en'), Type.Literal('de')])),
        }),
      },
    },
    async (request) => {
      if (!request.subject) throw unauthorized()
      const query = request.query as { q?: string; locale?: string }
      return search(db, request.subject, query)
    },
  )
}
