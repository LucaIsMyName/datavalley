import { eq } from 'drizzle-orm'
import {
  aiProviderDefaults,
  isAiProviderId,
  type AiProviderId,
} from '@datavalley/shared'
import type { Env } from '../../config/env.js'
import type { AppDatabase } from '../../database/client.js'
import { organizationAiSettings } from '../../database/schema.js'
import { AppError, badRequest } from '../../errors.js'
import { decryptString, encryptString } from '../../security/crypto.js'
import type { Subject } from '../../security/subject.js'

export type AiSettingsRow = typeof organizationAiSettings.$inferSelect

export type PublicAiSettings = {
  provider: AiProviderId
  model: string
  baseUrl: string
  enabled: boolean
  hasApiKey: boolean
}

const defaults: PublicAiSettings = {
  provider: 'openai',
  model: 'gpt-4.1',
  baseUrl: aiProviderDefaults.openai.baseUrl,
  enabled: false,
  hasApiKey: false,
}

export function organizationIdFor(subject: Subject) {
  const organizationId = subject.user?.organizationId
  if (!organizationId) throw new AppError(403, 'forbidden', 'Admin access is required')
  return organizationId
}

export function requireAdmin(subject: Subject | null) {
  if (subject?.role !== 'admin' || !subject.user) throw new AppError(403, 'forbidden', 'Admin access is required')
  return subject
}

export async function readAiSettings(db: AppDatabase, organizationId: string) {
  const [row] = await db
    .select()
    .from(organizationAiSettings)
    .where(eq(organizationAiSettings.organizationId, organizationId))
    .limit(1)
  return row ?? null
}

export function presentAiSettings(row: AiSettingsRow | null): PublicAiSettings {
  if (!row || !isAiProviderId(row.provider)) return defaults
  return {
    provider: row.provider,
    model: row.model,
    baseUrl: row.baseUrl || aiProviderDefaults[row.provider].baseUrl,
    enabled: row.enabled,
    hasApiKey: Boolean(row.apiKeyEncrypted),
  }
}

function cleanBaseUrl(provider: AiProviderId, raw: string | undefined) {
  const value = (raw?.trim() || aiProviderDefaults[provider].baseUrl).replace(/\/$/, '')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw badRequest('Invalid base URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw badRequest('Base URL must be http or https')
  return value
}

export async function saveAiSettings(
  db: AppDatabase,
  env: Env,
  subject: Subject,
  input: { provider: string; model: string; baseUrl?: string; enabled: boolean; apiKey?: string },
) {
  if (!isAiProviderId(input.provider)) throw badRequest('Unknown AI provider')
  const model = input.model.trim()
  if (!model || model.length > 200) throw badRequest('Model is required')
  const organizationId = organizationIdFor(subject)
  const existing = await readAiSettings(db, organizationId)
  const apiKey = input.apiKey?.trim() ?? ''
  const apiKeyEncrypted = apiKey
    ? encryptString(env.CREDENTIALS_KEY, apiKey)
    : existing?.apiKeyEncrypted ?? null
  if (input.enabled && aiProviderDefaults[input.provider].apiKeyRequired && !apiKeyEncrypted) {
    throw badRequest('An API key is required for this provider')
  }
  const baseUrl = cleanBaseUrl(input.provider, input.baseUrl)
  const now = new Date()
  await db
    .insert(organizationAiSettings)
    .values({
      organizationId,
      provider: input.provider,
      model,
      baseUrl,
      enabled: input.enabled,
      apiKeyEncrypted,
      updatedBy: subject.id,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: organizationAiSettings.organizationId,
      set: {
        provider: input.provider,
        model,
        baseUrl,
        enabled: input.enabled,
        apiKeyEncrypted,
        updatedBy: subject.id,
        updatedAt: now,
      },
    })
  return presentAiSettings(await readAiSettings(db, organizationId))
}

export async function aiStatus(db: AppDatabase, subject: Subject) {
  if (!subject.user) return { enabled: false }
  const row = await readAiSettings(db, subject.user.organizationId)
  return { enabled: Boolean(row?.enabled) }
}

export function decryptAiKey(env: Env, row: AiSettingsRow) {
  if (!row.apiKeyEncrypted) return ''
  try {
    return decryptString(env.CREDENTIALS_KEY, row.apiKeyEncrypted)
  } catch {
    throw badRequest('Stored API key could not be read')
  }
}
