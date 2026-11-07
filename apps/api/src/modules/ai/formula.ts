import { isAiProviderId } from '@datavalley/shared'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { AppError, badRequest } from '../../errors.js'
import type { Subject } from '../../security/subject.js'
import { formulaCatalog, previewFormula } from '../formulas/service.js'
import { complete } from './providers/complete.js'
import { formulaGuide } from './prompt.js'
import { decryptAiKey, readAiSettings } from './settings.js'

function expressionFrom(text: string) {
  const fenced = text.match(/```(?:json|text)?\s*([\s\S]*?)```/)
  const source = (fenced?.[1] ?? text).trim()
  if (source.startsWith('{')) {
    try {
      const parsed = JSON.parse(source) as { expression?: unknown }
      if (typeof parsed.expression === 'string' && parsed.expression.trim()) return parsed.expression.trim()
    } catch {
      // The model returned the expression itself.
    }
  }
  return source.replace(/^"+|"+$/g, '').trim()
}

function previewText(value: unknown) {
  if (value && typeof value === 'object' && 'error' in value) return String((value as { error: unknown }).error)
  if (typeof value === 'string') return value
  if (value == null) return ''
  return JSON.stringify(value)
}

export async function suggestFormula(
  db: AppDatabase,
  env: Env,
  subject: Subject,
  input: { prompt: string; tableId: string; columnId?: string; rowId?: string },
) {
  const organizationId = subject.user?.organizationId
  if (!organizationId) throw new AppError(403, 'forbidden', 'AI is turned off')
  const row = await readAiSettings(db, organizationId)
  if (!row?.enabled || !isAiProviderId(row.provider)) throw new AppError(403, 'forbidden', 'AI is turned off')
  const catalog = await formulaCatalog(db, subject, input.tableId)
  const names = catalog.columns
    .slice(0, 80)
    .map((column) => `${column.tableName} -> ${column.columnName}`)
    .join('\n')
  const relations = catalog.relations
    .slice(0, 20)
    .map((link) => `${link.name} -> ${link.toTableName} (${link.columns.map((column) => column.name).join(', ')})`)
    .join('\n')
  const completion = await complete({
    provider: row.provider,
    baseUrl: row.baseUrl || '',
    apiKey: decryptAiKey(env, row),
    model: row.model,
    tools: [],
    messages: [
      {
        role: 'system',
        content: `${formulaGuide}\nReply with only the expression in bracket form.\nColumns:\n${names}\nRelations:\n${relations}`,
      },
      { role: 'user', content: input.prompt.slice(0, 4000) },
    ],
  })
  const expression = expressionFrom(completion.content)
  if (!expression) throw badRequest('The model did not return a formula')
  const preview = await previewFormula(db, subject, input.tableId, expression, input.rowId)
  return { expression, preview: previewText(preview.value) }
}
