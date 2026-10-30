import { badRequest } from '../errors.js'

export const columnTypeIds = [
  'text',
  'long_text',
  'url',
  'mail',
  'number',
  'currency',
  'date',
  'datetime',
  'checkbox',
  'radio',
  'select',
  'multi_select',
  'media',
  'formula',
  'relation',
  'lookup',
] as const

export type ColumnTypeId = (typeof columnTypeIds)[number]

export type ColumnOption = { id: string; label: string; color: string | null; position: string }

export type ColumnShape = {
  id: string
  name: string
  type: string
  config: Record<string, unknown>
  options?: ColumnOption[]
}

export type CellWrite = {
  valueText: string | null
  valueNumber: string | null
  valueBool: boolean | null
  valueTimestamptz: Date | null
  valueJsonb: unknown | null
}

const empty: CellWrite = {
  valueText: null,
  valueNumber: null,
  valueBool: null,
  valueTimestamptz: null,
  valueJsonb: null,
}

function textOperators() {
  return ['eq', 'neq', 'contains', 'not_contains', 'starts_with', 'ends_with', 'empty', 'not_empty', 'gt', 'lt', 'between']
}

export function operatorsFor(type: string): string[] {
  if (type === 'number' || type === 'currency' || type === 'date' || type === 'datetime') {
    return ['eq', 'neq', 'gt', 'lt', 'between', 'empty', 'not_empty']
  }
  if (type === 'checkbox') return ['eq', 'empty', 'not_empty']
  if (type === 'select' || type === 'radio' || type === 'multi_select' || type === 'relation') {
    return ['eq', 'neq', 'empty', 'not_empty']
  }
  if (type === 'formula' || type === 'lookup' || type === 'media') return ['empty', 'not_empty']
  return textOperators()
}

export function isWritable(type: string) {
  return type !== 'formula' && type !== 'lookup'
}

function one(partial: Partial<CellWrite>): CellWrite {
  return { ...empty, ...partial }
}

function optionId(column: ColumnShape, labelOrId: string) {
  const match = column.options?.find((option) => option.id === labelOrId || option.label.toLowerCase() === labelOrId.toLowerCase())
  if (!match) throw badRequest(`Unknown option for ${column.name}`)
  return match.id
}

export function parseCell(column: ColumnShape, input: unknown): CellWrite | null {
  if (!isWritable(column.type)) throw badRequest(`${column.name} is calculated`)
  if (input == null || input === '') return null
  switch (column.type) {
    case 'text':
    case 'long_text':
      return one({ valueText: String(input) })
    case 'url': {
      const value = String(input)
      try {
        const url = new URL(value)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol')
      } catch {
        throw badRequest(`${column.name} must be an http(s) URL`)
      }
      return one({ valueText: value })
    }
    case 'mail': {
      const value = String(input).trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw badRequest(`${column.name} must be an email address`)
      return one({ valueText: value })
    }
    case 'number':
    case 'currency': {
      const numeric = typeof input === 'number' ? input : Number(String(input).trim())
      if (!Number.isFinite(numeric)) throw badRequest(`${column.name} must be a number`)
      return one({ valueNumber: numeric.toFixed(4) })
    }
    case 'date': {
      const value = String(input)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
        throw badRequest(`${column.name} must be a YYYY-MM-DD date`)
      }
      return one({ valueText: value })
    }
    case 'datetime': {
      const date = new Date(String(input))
      if (Number.isNaN(date.getTime())) throw badRequest(`${column.name} must be a date and time`)
      return one({ valueTimestamptz: date })
    }
    case 'checkbox':
      return one({ valueBool: input === true || input === 'true' || input === '1' || input === 'yes' })
    case 'select':
    case 'radio':
      return one({ valueJsonb: { optionId: optionId(column, String(input)) } })
    case 'multi_select': {
      const values = Array.isArray(input) ? input.map(String) : String(input).split('|').filter(Boolean)
      return one({ valueJsonb: { optionIds: values.map((value) => optionId(column, value)) } })
    }
    case 'relation':
      return one({ valueJsonb: { rowId: String(input) } })
    case 'media':
      if (typeof input !== 'object' || input == null || !('fileId' in input)) {
        throw badRequest(`${column.name} needs an uploaded file`)
      }
      return one({ valueJsonb: input })
    default:
      throw badRequest(`Unsupported column type ${column.type}`)
  }
}

export function readCell(column: ColumnShape, row: Partial<CellWrite> | undefined): unknown {
  if (!row) return null
  if (column.type === 'checkbox') return row.valueBool ?? null
  if (column.type === 'number' || column.type === 'currency') {
    return row.valueNumber == null ? null : Number(row.valueNumber)
  }
  if (column.type === 'datetime') {
    return row.valueTimestamptz ? new Date(row.valueTimestamptz).toISOString() : null
  }
  if (column.type === 'select' || column.type === 'radio') {
    const value = row.valueJsonb as { optionId?: string } | null
    return value?.optionId ?? null
  }
  if (column.type === 'multi_select') {
    const value = row.valueJsonb as { optionIds?: string[] } | null
    return value?.optionIds ?? null
  }
  if (column.type === 'relation') {
    const value = row.valueJsonb as { rowId?: string } | null
    return value?.rowId ?? null
  }
  if (column.type === 'media') return row.valueJsonb ?? null
  return row.valueText ?? null
}

export function coerceImport(column: ColumnShape, raw: string): CellWrite | null {
  if (raw.trim() === '') return null
  if (column.type === 'checkbox') return parseCell(column, ['true', 'yes', '1'].includes(raw.trim().toLowerCase()))
  if (column.type === 'multi_select') return parseCell(column, raw.split('|').map((part) => part.trim()))
  return parseCell(column, raw.trim())
}

export function compatible(from: string, to: string) {
  if (from === to) return true
  const textLike = new Set(['text', 'long_text', 'url', 'mail'])
  if (textLike.has(from) && textLike.has(to)) return true
  if ((from === 'select' && to === 'radio') || (from === 'radio' && to === 'select')) return true
  if ((from === 'number' && to === 'currency') || (from === 'currency' && to === 'number')) return true
  return false
}
