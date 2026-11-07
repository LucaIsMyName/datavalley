import { Type } from '@sinclair/typebox'
import { aiProviderIds, aiProviderModels, isAiProviderId } from '@datavalley/shared'
import type { FastifyInstance } from 'fastify'
import type { Env } from '../../config/env.js'
import type { RateLimiter } from '../../security/rate-limit.js'
import type { AppDatabase } from '../../database/client.js'
import { unauthorized } from '../../errors.js'
import { answerChat } from './chat.js'
import { draftConnector } from './connector-draft.js'
import { suggestFormula } from './formula.js'
import { listOllamaModels } from './providers/complete.js'
import { assertAiChatRateLimit } from './chat-rate-limit.js'
import { aiStatus, presentAiSettings, readAiSettings, requireAdmin, saveAiSettings } from './settings.js'

const providerSchema = Type.Union(aiProviderIds.map((id) => Type.Literal(id)))

export function registerAiRoutes(app: FastifyInstance, db: AppDatabase, env: Env, rateLimiter: RateLimiter) {
  app.get('/ai/status', async (request) => {
    if (!request.subject) throw unauthorized()
    return aiStatus(db, request.subject)
  })

  app.get('/ai/settings', async (request) => {
    const subject = requireAdmin(request.subject)
    const row = await readAiSettings(db, subject.user!.organizationId)
    return { settings: presentAiSettings(row) }
  })

  app.put(
    '/ai/settings',
    {
      schema: {
        body: Type.Object({
          provider: providerSchema,
          model: Type.String({ minLength: 1, maxLength: 200 }),
          baseUrl: Type.Optional(Type.String({ maxLength: 500 })),
          enabled: Type.Boolean(),
          apiKey: Type.Optional(Type.String({ maxLength: 500 })),
        }),
      },
    },
    async (request) => {
      const subject = requireAdmin(request.subject)
      const body = request.body as { provider: string; model: string; baseUrl?: string; enabled: boolean; apiKey?: string }
      return { settings: await saveAiSettings(db, env, subject, body) }
    },
  )

  app.get('/ai/models', async (request) => {
    requireAdmin(request.subject)
    const query = request.query as { provider?: string; baseUrl?: string }
    const provider = query.provider && isAiProviderId(query.provider) ? query.provider : 'openai'
    if (provider === 'ollama') {
      const models = await listOllamaModels(query.baseUrl || 'http://127.0.0.1:11434')
      return { models }
    }
    return { models: aiProviderModels[provider] }
  })

  app.post(
    '/ai/chat',
    {
      schema: {
        body: Type.Object({
          messages: Type.Array(
            Type.Object({
              role: Type.Union([Type.Literal('user'), Type.Literal('assistant')]),
              content: Type.String({ minLength: 1, maxLength: 8000 }),
            }),
            { minItems: 1, maxItems: 30 },
          ),
          context: Type.Optional(
            Type.Object({
              projectId: Type.Optional(Type.String()),
              tableId: Type.Optional(Type.String()),
            }),
          ),
        }),
      },
    },
    async (request) => {
      if (!request.subject?.user) throw unauthorized()
      await assertAiChatRateLimit(rateLimiter, env, request.subject.id)
      const body = request.body as {
        messages: { role: 'user' | 'assistant'; content: string }[]
        context?: { projectId?: string; tableId?: string }
      }
      return answerChat(db, env, request.subject, body)
    },
  )

  app.post(
    '/ai/formula',
    {
      schema: {
        body: Type.Object({
          prompt: Type.String({ minLength: 1, maxLength: 4000 }),
          tableId: Type.String(),
          columnId: Type.Optional(Type.String()),
          rowId: Type.Optional(Type.String()),
        }),
      },
    },
    async (request) => {
      if (!request.subject?.user) throw unauthorized()
      const body = request.body as { prompt: string; tableId: string; columnId?: string; rowId?: string }
      return suggestFormula(db, env, request.subject, body)
    },
  )

  app.post(
    '/ai/connectors/draft',
    {
      schema: {
        body: Type.Object({
          prompt: Type.String({ minLength: 1, maxLength: 2000 }),
          url: Type.String({ minLength: 1, maxLength: 2000 }),
        }),
      },
    },
    async (request) => {
      if (!request.subject?.user) throw unauthorized()
      const body = request.body as { prompt: string; url: string }
      return draftConnector(db, env, request.subject, body)
    },
  )
}
