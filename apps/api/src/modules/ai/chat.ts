import type { AiChatResponse } from '@datavalley/shared'
import { isAiProviderId } from '@datavalley/shared'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { AppError } from '../../errors.js'
import type { Subject } from '../../security/subject.js'
import { requireTable } from '../tables/service.js'
import { runChatLoop } from './loop.js'
import { complete } from './providers/complete.js'
import type { AiChatMessage } from './providers/types.js'
import { chatSystemPrompt } from './prompt.js'
import { decryptAiKey, readAiSettings } from './settings.js'
import { emptyEffects, runTool, toolDefinitions } from './tools/registry.js'

export async function answerChat(
  db: AppDatabase,
  env: Env,
  subject: Subject,
  input: { messages: { role: 'user' | 'assistant'; content: string }[]; context?: { projectId?: string; tableId?: string } },
): Promise<AiChatResponse> {
  const organizationId = subject.user?.organizationId
  if (!organizationId) throw new AppError(403, 'forbidden', 'AI is turned off')
  const row = await readAiSettings(db, organizationId)
  if (!row?.enabled || !isAiProviderId(row.provider)) throw new AppError(403, 'forbidden', 'AI is turned off')
  const context = await contextLine(db, subject, input.context)
  const messages: AiChatMessage[] = [
    { role: 'system', content: chatSystemPrompt(context) },
    ...input.messages.slice(-20).map((message) => ({ role: message.role, content: message.content.slice(0, 8000) })),
  ]
  const effects = emptyEffects()
  const result = await runChatLoop({
    complete,
    request: {
      provider: row.provider,
      baseUrl: row.baseUrl || '',
      apiKey: decryptAiKey(env, row),
      model: row.model,
      tools: toolDefinitions(),
    },
    messages,
    run: (name, args) => runTool({ db, subject, effects }, name, args),
  })
  return { message: result.message, highlights: effects.highlights, proposals: effects.proposals }
}

async function contextLine(db: AppDatabase, subject: Subject, context?: { projectId?: string; tableId?: string }) {
  if (!context?.tableId) {
    return context?.projectId
      ? `The user is looking at project ${context.projectId}.`
      : 'The user is not looking at a table.'
  }
  try {
    const table = await requireTable(db, subject, context.tableId, 'view')
    return `The user is looking at table ${table.name} (${table.id}) in project ${table.projectId}.`
  } catch {
    return 'The user is looking at a table they cannot view. Do not assume its contents.'
  }
}
