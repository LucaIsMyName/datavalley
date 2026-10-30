import type { users } from '../database/schema.js'

export type Subject = {
  kind: 'user' | 'api_key'
  id: string
  role: 'admin' | 'user' | 'service'
  source: 'web' | 'api_key' | 'plugin'
  user: typeof users.$inferSelect | null
  apiKeyId?: string
  pluginScopes?: string[]
}
