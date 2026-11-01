import {
  MAX_MEDIA_FILES_PER_CELL,
  normalizeMediaCellValue,
  parseMediaCellInput,
  validateDateRangePayload,
} from '@datavalley/shared'
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
  'tags',
  'user',
  'status',
  'row_id',
] as const

export type ColumnTypeId = (typeof columnTypeIds)[number]

export function defaultColumnIcon(type: string) {
  if (type === 'long_text') return 'AlignLeft'
  if (type === 'number') return 'Hash'
  if (type === 'currency') return 'Coins'
  if (type === 'mail') return 'Mail'
  if (type === 'url') return 'Link'
  if (type === 'date') return 'Calendar'
  if (type === 'datetime') return 'CalendarClock'
  if (type === 'checkbox') return 'CheckSquare'
  if (type === 'select' || type === 'radio' || type === 'status') return 'CircleDot'
  if (type === 'tags' || type === 'multi_select') return 'Tags'
  if (type === 'user') return 'Users'
  if (type === 'row_id') return 'Fingerprint'
  if (type === 'formula' || type === 'lookup') return 'FunctionSquare'
  if (type === 'relation') return 'ArrowRightLeft'
  if (type === 'media') return 'Paperclip'
  return 'Type'
}

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
  if (type === 'formula' || type === 'lookup' || type === 'media' || type === 'row_id') return ['empty', 'not_empty']
  if (type === 'tags' || type === 'user' || type === 'status') return ['eq', 'neq', 'empty', 'not_empty']
  return textOperators()
}

export function isWritable(type: string) {
  return type !== 'formula' && type !== 'lookup' && type !== 'row_id'
}

export const tagColors = ['amber', 'green', 'blue', 'red', 'violet', 'orange', 'pink', 'teal', 'slate', 'yellow']

export function nextTagColor(used: number) {
  return tagColors[used % tagColors.length]
}

function one(partial: Partial<CellWrite>): CellWrite {
  return { ...empty, ...partial }
}

function optionId(column: ColumnShape, labelOrId: string) {
  const match = column.options?.find((option) => option.id === labelOrId || option.label.toLowerCase() === labelOrId.toLowerCase())
  if (!match) throw badRequest(`Unknown option for ${column.name}`)
  return match.id
}

function dateRangeEnabled(column: ColumnShape) {
  return Boolean(column.config.range) && (column.type === 'date' || column.type === 'datetime')
}

function parseSingleDate(column: ColumnShape, input: unknown): CellWrite {
  const value = String(input)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw badRequest(`${column.name} must be a YYYY-MM-DD date`)
  }
  return one({ valueText: value })
}

function parseSingleDatetime(column: ColumnShape, input: unknown): CellWrite {
  const raw = String(input)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return one({ valueText: raw })
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) throw badRequest(`${column.name} must be a date and time`)
  return one({ valueTimestamptz: date })
}

function parseDateRange(column: ColumnShape, input: unknown): CellWrite {
  const kind = column.type === 'datetime' ? 'datetime' : 'date'
  const checked = validateDateRangePayload(input, kind)
  if (!checked.ok) {
    if (checked.reason === 'endNotAfterStart') throw badRequest(`${column.name}: end must be after start`)
    throw badRequest(`${column.name} must be a valid date range`)
  }
  return one({ valueJsonb: checked.value })
}

function readDateRangeJsonb(row: Partial<CellWrite>): { from: string; to: string } | null {
  const value = row.valueJsonb as { from?: string; to?: string } | null
  if (value?.from && value?.to) return { from: value.from, to: value.to }
  return null
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
      const variant = column.type === 'currency' ? 'money' : String(column.config.variant ?? 'float')
      if (variant === 'integer' && !Number.isInteger(numeric)) throw badRequest(`${column.name} must be a whole number`)
      return one({ valueNumber: numeric.toFixed(4) })
    }
    case 'date': {
      if (dateRangeEnabled(column)) return parseDateRange(column, input)
      return parseSingleDate(column, input)
    }
    case 'datetime': {
      if (dateRangeEnabled(column)) return parseDateRange(column, input)
      return parseSingleDatetime(column, input)
    }
    case 'tags': {
      const values = Array.isArray(input) ? input.map(String) : String(input).split('|').map((part) => part.trim()).filter(Boolean)
      return one({ valueJsonb: { tagIds: values } })
    }
    case 'user': {
      const values = Array.isArray(input) ? input.map(String) : String(input).split('|').map((part) => part.trim()).filter(Boolean)
      return one({ valueJsonb: { userIds: values } })
    }
    case 'status':
      return one({ valueJsonb: { statusId: String(input) } })
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
    case 'media': {
      if (input == null || input === '') return null
      try {
        const normalized = parseMediaCellInput(input)
        if (!normalized) return null
        return one({ valueJsonb: normalized })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'invalid_media_cell'
        if (message === 'too_many_media_files') {
          throw badRequest(`${column.name} can hold at most ${MAX_MEDIA_FILES_PER_CELL} files`)
        }
        throw badRequest(`${column.name} needs uploaded files`)
      }
    }
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
  if (column.type === 'date' || column.type === 'datetime') {
    const range = readDateRangeJsonb(row)
    if (range) return range
    if (column.type === 'datetime') {
      if (row.valueText) return row.valueText
      return row.valueTimestamptz ? new Date(row.valueTimestamptz).toISOString() : null
    }
    return row.valueText ?? null
  }
  if (column.type === 'tags') {
    const value = row.valueJsonb as { tagIds?: string[] } | null
    return value?.tagIds ?? null
  }
  if (column.type === 'user') {
    const value = row.valueJsonb as { userIds?: string[] } | null
    return value?.userIds ?? null
  }
  if (column.type === 'status') {
    const value = row.valueJsonb as { statusId?: string } | null
    return value?.statusId ?? null
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
  if (column.type === 'media') return normalizeMediaCellValue(row.valueJsonb)
  return row.valueText ?? null
}

export function coerceImport(column: ColumnShape, raw: string): CellWrite | null {
  if (raw.trim() === '') return null
  if (column.type === 'checkbox') return parseCell(column, ['true', 'yes', '1'].includes(raw.trim().toLowerCase()))
  if (column.type === 'multi_select' || column.type === 'tags' || column.type === 'user') return parseCell(column, raw.split('|').map((part) => part.trim()))
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
