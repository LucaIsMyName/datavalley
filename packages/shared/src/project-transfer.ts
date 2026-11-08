import type { FormatRule } from './formatting.js'

export const PROJECT_TRANSFER_KIND = 'datavalley.project' as const
export const PROJECT_TRANSFER_VERSION = 1 as const

export type PortableFormatRule = Omit<FormatRule, 'columnId'> & {
  column?: string
}

export type PortableColumnOption = {
  label: string
  color: string | null
  position: string
}

export type PortableColumn = {
  name: string
  description: string
  type: string
  config: Record<string, unknown>
  position: string
  hidden: boolean
  width: number
  frozen: boolean
  options?: PortableColumnOption[]
}

export type PortableCell = {
  column: string
  value: unknown
  background?: string | null
  formatRules?: PortableFormatRule[]
}

export type PortableRow = {
  rowNumber: number
  position: string
  color: string | null
  notes: string
  cells: PortableCell[]
}

export type PortableView = {
  name: string
  definition: Record<string, unknown>
}

export type PortableTable = {
  name: string
  description: string
  icon: string
  position: string
  headerConfig: unknown
  footerConfig: unknown
  formatRules: PortableFormatRule[]
  nextRowNumber: number
  locked: boolean
  activity?: boolean
  mirrorOf?: string
  columns: PortableColumn[]
  tags: { name: string; color: string }[]
  statuses: { name: string; color: string; position: string }[]
  rows: PortableRow[]
  views: PortableView[]
}

export type PortableFormula = {
  table: string
  column: string
  rowNumber: number
  expression: string
}

export type ProjectTransferDocument = {
  kind: typeof PROJECT_TRANSFER_KIND
  version: typeof PROJECT_TRANSFER_VERSION
  exportedAt: string
  warnings?: string[]
  project: {
    name: string
    description: string
    icon: string
    settings: Record<string, unknown>
  }
  tables: PortableTable[]
  formulas: PortableFormula[]
}

export function isProjectTransferDocument(value: unknown): value is ProjectTransferDocument {
  if (!value || typeof value !== 'object') return false
  const record = value as ProjectTransferDocument
  return (
    record.kind === PROJECT_TRANSFER_KIND &&
    record.version === PROJECT_TRANSFER_VERSION &&
    typeof record.project?.name === 'string' &&
    Array.isArray(record.tables) &&
    Array.isArray(record.formulas)
  )
}
