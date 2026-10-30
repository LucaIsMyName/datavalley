import type { TSchema } from '@sinclair/typebox'

export const pluginScopes = [
  'rows:read',
  'rows:write',
  'structure:read',
  'structure:write',
  'files:read',
  'files:write',
  'sync:run',
] as const

export type PluginScope = (typeof pluginScopes)[number]

export type PluginManifest = {
  id: string
  name: string
  version: string
  scopes: PluginScope[]
}

export type PluginLogger = {
  info: (message: string, extra?: Record<string, unknown>) => void
  error: (message: string, extra?: Record<string, unknown>) => void
}

export type ColumnInfo = {
  id: string
  name: string
  type: string
}

export type ImportResult = {
  created: number
  errors: { row: number; message: string }[]
  chunks: { chunk: number; error?: string }[]
}

export type PluginHostApi = {
  log: PluginLogger
  getConfig: () => Promise<Record<string, unknown>>
  listColumns: (tableId: string) => Promise<ColumnInfo[]>
  importRows: (tableId: string, rows: Record<string, string>[]) => Promise<ImportResult>
  exportCsv: (tableId: string, viewId?: string) => Promise<string>
}

export type PluginDefinition = {
  manifest: PluginManifest
  configSchema?: TSchema
  importRows?: (tableId: string, bytes: Uint8Array, api: PluginHostApi) => Promise<ImportResult>
  exportRows?: (tableId: string, api: PluginHostApi, viewId?: string) => Promise<Uint8Array>
  sync?: (connectionId: string, api: PluginHostApi) => Promise<{ imported: number; errors: string[] }>
  webhook?: (body: unknown, headers: Record<string, string | undefined>, api: PluginHostApi) => Promise<void>
  schedule?: { cron: string; run: (api: PluginHostApi) => Promise<void> }
}

export function assertScope(granted: readonly string[], required: PluginScope) {
  if (!granted.includes(required)) {
    const error = new Error(`Plugin is missing the ${required} scope`)
    error.name = 'PluginScopeError'
    throw error
  }
}
