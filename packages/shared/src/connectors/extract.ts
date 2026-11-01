import { csvTable, normalizeCsvDelimiter } from '../csv.js'
import type { ConnectorParseConfig } from './schema.js'

export type MappedRecord = Record<string, string>

function slugFieldKey(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'field'
}

export function normalizeConnectorParseConfig(input: unknown): ConnectorParseConfig {
  const raw = input && typeof input === 'object' ? (input as ConnectorParseConfig) : { version: 1 as const, fields: [] }
  const fields = Array.isArray(raw.fields)
    ? raw.fields.map((field) => ({
        sourceKey: String(field.sourceKey ?? '').trim(),
        targetFieldKey: slugFieldKey(String(field.targetFieldKey ?? field.sourceKey ?? 'field')),
        targetLabel: field.targetLabel?.trim() || undefined,
        coerce: field.coerce,
      })).filter((field) => field.sourceKey.length > 0)
    : []
  return {
    version: 1,
    recordsPath: raw.recordsPath?.trim() || undefined,
    externalIdPath: raw.externalIdPath?.trim() || undefined,
    fields,
    csv: raw.csv,
  }
}

function readPathSegment(value: unknown, segment: string): unknown {
  if (segment === '' || value == null) return value
  if (segment.endsWith(']')) {
    const bracket = segment.indexOf('[')
    const key = bracket >= 0 ? segment.slice(0, bracket) : segment.slice(0, -2)
    const indexRaw = bracket >= 0 ? segment.slice(bracket + 1, -1) : '*'
    const next = key ? readPathSegment(value, key) : value
    if (!Array.isArray(next)) return undefined
    if (indexRaw === '*' || indexRaw === '') return next
    const index = Number(indexRaw)
    return Number.isInteger(index) ? next[index] : undefined
  }
  if (Array.isArray(value)) {
    const index = Number(segment)
    if (Number.isInteger(index)) return value[index]
    return undefined
  }
  if (typeof value === 'object') return (value as Record<string, unknown>)[segment]
  return undefined
}

export function getValueAtPath(root: unknown, path: string | undefined): unknown {
  if (!path || path === '$') return root
  let normalized = path.trim()
  if (normalized.startsWith('$.')) normalized = normalized.slice(2)
  if (normalized.startsWith('/')) normalized = normalized.slice(1)
  const parts = normalized.split('.').filter(Boolean)
  let current: unknown = root
  for (const part of parts) {
    if (part.endsWith('[*]')) {
      const head = part.slice(0, -3)
      current = readPathSegment(current, head)
      if (!Array.isArray(current)) return undefined
      return current
    }
    current = readPathSegment(current, part)
    if (current === undefined) return undefined
  }
  return current
}

export function extractJsonRecords(root: unknown, parse: ConnectorParseConfig): unknown[] {
  const at = getValueAtPath(root, parse.recordsPath)
  if (Array.isArray(at)) return at
  if (at != null && typeof at === 'object') return [at]
  if (!parse.recordsPath && Array.isArray(root)) return root
  if (!parse.recordsPath && root != null && typeof root === 'object') return [root]
  return []
}

export function mapRecordFields(record: unknown, parse: ConnectorParseConfig): MappedRecord {
  const output: MappedRecord = {}
  for (const field of parse.fields) {
    const value = getValueAtPath(record, field.sourceKey)
    if (value == null) {
      output[field.targetFieldKey] = ''
      continue
    }
    if (typeof value === 'object') output[field.targetFieldKey] = JSON.stringify(value)
    else output[field.targetFieldKey] = String(value)
  }
  return output
}

export function extractRecordsFromPayload(
  format: 'json' | 'csv' | 'xml' | 'html',
  body: string,
  parse: ConnectorParseConfig,
): MappedRecord[] {
  if (format === 'csv') {
    let delimiter = ','
    try {
      delimiter = normalizeCsvDelimiter(parse.csv?.delimiter)
    } catch {
      delimiter = ','
    }
    const headerRow = parse.csv?.headerRow ?? true
    const parsed = csvTable(body, headerRow, delimiter)
    const headers = parsed.names
    return parsed.records.map((row) => {
      const record: MappedRecord = {}
      for (const field of parse.fields) {
        const index = headers.findIndex((name) => name === field.sourceKey)
        record[field.targetFieldKey] = index >= 0 ? (row[index] ?? '') : ''
      }
      if (parse.fields.length === 0) {
        headers.forEach((name, index) => {
          record[slugFieldKey(name)] = row[index] ?? ''
        })
      }
      return record
    })
  }
  if (format === 'json') {
    const root = JSON.parse(body) as unknown
    const records = extractJsonRecords(root, parse)
    return records.map((record) => mapRecordFields(record, parse))
  }
  if (format === 'xml') {
    return extractXmlRecords(body, parse)
  }
  return extractHtmlRecords(body, parse)
}

export function externalKeyForRecord(record: unknown, parse: ConnectorParseConfig): string | null {
  if (!parse.externalIdPath) return null
  const value = getValueAtPath(record, parse.externalIdPath)
  if (value == null || value === '') return null
  return String(value)
}

export function externalKeyFromMapped(mapped: MappedRecord, parse: ConnectorParseConfig): string | null {
  if (!parse.externalIdPath) return null
  const slug = slugFieldKey(parse.externalIdPath.replace(/^\$\./, '').split('.').pop() ?? parse.externalIdPath)
  const field = parse.fields.find((f) => f.sourceKey === parse.externalIdPath || f.targetFieldKey === slug)
  const key = field ? mapped[field.targetFieldKey] : mapped[slug]
  if (!key) return null
  return key
}

export function suggestJsonRecordsPaths(root: unknown): string[] {
  const suggestions: string[] = []
  if (Array.isArray(root)) {
    suggestions.push('$')
    return suggestions
  }
  if (root && typeof root === 'object') {
    for (const [key, value] of Object.entries(root as Record<string, unknown>)) {
      if (Array.isArray(value)) suggestions.push(key, `$.${key}`)
    }
  }
  return suggestions.slice(0, 8)
}

export function sampleFieldKeysFromRecords(records: unknown[], limit = 20): string[] {
  const keys = new Set<string>()
  for (const record of records.slice(0, 5)) {
    if (record && typeof record === 'object' && !Array.isArray(record)) {
      for (const key of Object.keys(record as Record<string, unknown>)) keys.add(key)
    }
  }
  return [...keys].slice(0, limit)
}

function extractXmlRecords(body: string, parse: ConnectorParseConfig): MappedRecord[] {
  const recordsPath = parse.recordsPath?.trim()
  if (!recordsPath) {
    return [{ text: body.slice(0, 5000) }]
  }
  const tag = recordsPath.replace(/^\/+/, '').split('/').pop()?.replace(/^\*/, '') ?? recordsPath
  const open = new RegExp(`<${escapeRegExp(tag)}(?:\\s[^>]*)?>`, 'gi')
  const close = new RegExp(`</${escapeRegExp(tag)}>`, 'gi')
  const chunks: string[] = []
  let match: RegExpExecArray | null
  const opens: number[] = []
  while ((match = open.exec(body)) !== null) opens.push(match.index)
  for (let i = 0; i < opens.length; i += 1) {
    const start = opens[i]
    close.lastIndex = start
    const endMatch = close.exec(body)
    if (!endMatch) continue
    chunks.push(body.slice(start, endMatch.index + endMatch[0].length))
  }
  return chunks.map((chunk) => mapXmlChunk(chunk, parse))
}

function mapXmlChunk(chunk: string, parse: ConnectorParseConfig): MappedRecord {
  const output: MappedRecord = {}
  for (const field of parse.fields) {
    const tag = field.sourceKey.replace(/^\/+/, '').split('/').pop() ?? field.sourceKey
    const re = new RegExp(`<${escapeRegExp(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRegExp(tag)}>`, 'i')
    const match = re.exec(chunk)
    output[field.targetFieldKey] = match ? decodeXmlText(match[1]) : ''
  }
  if (parse.fields.length === 0) {
    output.text = decodeXmlText(chunk.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  }
  return output
}

function extractHtmlRecords(body: string, parse: ConnectorParseConfig): MappedRecord[] {
  const selector = parse.recordsPath?.trim()
  if (!selector) {
    return [{ text: body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000) }]
  }
  const classMatch = selector.match(/^\.([a-z0-9_-]+)$/i)
  if (classMatch) {
    const className = classMatch[1]
    const re = new RegExp(`<([a-z0-9]+)[^>]*class="[^"]*\\b${escapeRegExp(className)}\\b[^"]*"[^>]*>([\\s\\S]*?)</\\1>`, 'gi')
    const rows: MappedRecord[] = []
    let match: RegExpExecArray | null
    while ((match = re.exec(body)) !== null) {
      rows.push(mapHtmlChunk(match[2], parse))
    }
    return rows
  }
  return [{ text: body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000) }]
}

function mapHtmlChunk(chunk: string, parse: ConnectorParseConfig): MappedRecord {
  const output: MappedRecord = {}
  for (const field of parse.fields) {
    if (field.sourceKey.startsWith('.')) {
      const className = field.sourceKey.slice(1)
      const re = new RegExp(`<([a-z0-9]+)[^>]*class="[^"]*\\b${escapeRegExp(className)}\\b[^"]*"[^>]*>([\\s\\S]*?)</\\1>`, 'i')
      const match = re.exec(chunk)
      output[field.targetFieldKey] = match ? stripTags(match[2]) : ''
    } else {
      output[field.targetFieldKey] = stripTags(chunk)
    }
  }
  if (parse.fields.length === 0) output.text = stripTags(chunk)
  return output
}

function stripTags(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function decodeXmlText(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
