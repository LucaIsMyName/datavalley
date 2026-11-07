import { isAiProviderId, type AiConnectorDraft } from '@datavalley/shared'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { AppError, badRequest } from '../../errors.js'
import type { Subject } from '../../security/subject.js'
import { fetchConnectorPayload } from '../connectors/fetch.js'
import { complete } from './providers/complete.js'
import { decryptAiKey, readAiSettings } from './settings.js'

const formats = new Set(['json', 'csv', 'xml', 'html'])

let fetchOverride: ((url: string) => Promise<string>) | null = null

export function setConnectorFetchForTests(next: ((url: string) => Promise<string>) | null) {
  if (process.env.NODE_ENV !== 'test') return
  fetchOverride = next
}

function draftFrom(text: string): AiConnectorDraft {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const source = fenced?.[1] ?? text
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start < 0 || end <= start) throw badRequest('The model did not return a connector draft')
  const parsed = JSON.parse(source.slice(start, end + 1)) as Record<string, unknown>
  const format = typeof parsed.format === 'string' ? parsed.format : ''
  if (!formats.has(format)) throw badRequest('The model did not return a connector draft')
  const name = typeof parsed.name === 'string' ? parsed.name.trim() : ''
  if (!name) throw badRequest('The model did not return a connector draft')
  const fields = Array.isArray(parsed.fields) ? parsed.fields : []
  const mapped = fields.flatMap((field) => {
    if (!field || typeof field !== 'object') return []
    const record = field as Record<string, unknown>
    const sourceKey = typeof record.sourceKey === 'string' ? record.sourceKey.trim() : ''
    const targetFieldKey = typeof record.targetFieldKey === 'string' ? record.targetFieldKey.trim() : sourceKey
    const targetLabel = typeof record.targetLabel === 'string' ? record.targetLabel.trim() : undefined
    if (!sourceKey || !targetFieldKey) return []
    return [{ sourceKey, targetFieldKey, targetLabel }]
  })
  if (mapped.length === 0) throw badRequest('The model did not return a connector draft')
  return {
    name,
    format: format as AiConnectorDraft['format'],
    recordsPath: typeof parsed.recordsPath === 'string' ? parsed.recordsPath.trim() : undefined,
    externalIdPath: typeof parsed.externalIdPath === 'string' ? parsed.externalIdPath.trim() : undefined,
    fields: mapped.slice(0, 40),
  }
}

async function loadBody(url: string) {
  if (process.env.NODE_ENV === 'test' && fetchOverride) return fetchOverride(url)
  return fetchConnectorPayload({ baseUrl: url, method: 'GET' }, { type: 'none' }, null)
}

export async function draftConnector(
  db: AppDatabase,
  env: Env,
  subject: Subject,
  input: { prompt: string; url: string },
) {
  const organizationId = subject.user?.organizationId
  if (!organizationId) throw new AppError(403, 'forbidden', 'AI is turned off')
  const row = await readAiSettings(db, organizationId)
  if (!row?.enabled || !isAiProviderId(row.provider)) throw new AppError(403, 'forbidden', 'AI is turned off')
  let url: URL
  try {
    url = new URL(input.url.trim())
  } catch {
    throw badRequest('Invalid base URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw badRequest('URL must be http or https')
  const body = await loadBody(url.toString())
  const sample = body.slice(0, 6000)
  const completion = await complete({
    provider: row.provider,
    baseUrl: row.baseUrl || '',
    apiKey: decryptAiKey(env, row),
    model: row.model,
    tools: [],
    messages: [
      {
        role: 'system',
        content:
          'Reply with JSON only: {"name","format","recordsPath","externalIdPath","fields":[{"sourceKey","targetFieldKey","targetLabel"}]}. format is json, csv, xml, or html. Do not save a connector.',
      },
      { role: 'user', content: `${input.prompt.slice(0, 2000)}\nURL: ${url.toString()}\nBody sample:\n${sample}` },
    ],
  })
  return { draft: draftFrom(completion.content) }
}
