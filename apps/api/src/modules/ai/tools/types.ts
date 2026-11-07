import type { AiFormulaProposal, AiHighlight, AiCellProposal } from '@datavalley/shared'
import type { AppDatabase } from '../../../database/client.js'
import type { Subject } from '../../../security/subject.js'

export type ToolEffects = {
  highlights: AiHighlight[]
  proposals: Array<AiCellProposal | AiFormulaProposal>
  navigation: { path: string } | null
}

export type ToolHost = {
  db: AppDatabase
  subject: Subject
  effects: ToolEffects
}

export type AiTool = {
  name: string
  description: string
  parameters: Record<string, unknown>
  run: (host: ToolHost, args: Record<string, unknown>) => Promise<unknown>
}

export function emptyEffects(): ToolEffects {
  return { highlights: [], proposals: [], navigation: null }
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function clip(value: string, max = 80) {
  const text = value.trim()
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

export function plainValue(value: unknown): boolean {
  if (value == null) return true
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true
  if (Array.isArray(value)) {
    return value.every((item) => item == null || ['string', 'number', 'boolean'].includes(typeof item))
  }
  return false
}
