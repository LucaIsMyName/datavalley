import spec from '../../../../../packages/contracts/openapi.json'
import { headingId } from './toc'

export type JsonSchema = {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  enum?: unknown[]
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  additionalProperties?: boolean | JsonSchema
  format?: string
}

export type OpenApiParameter = {
  name: string
  in: 'path' | 'query' | 'header' | 'cookie'
  required?: boolean
  schema?: JsonSchema
}

export type OpenApiOperation = {
  summary?: string
  description?: string
  parameters?: OpenApiParameter[]
  requestBody?: { content?: Record<string, { schema?: JsonSchema }> }
  responses?: Record<string, { description?: string; content?: Record<string, { schema?: JsonSchema }> }>
}

export type OpenApiSpec = {
  servers?: { url: string }[]
  paths: Record<string, Record<string, OpenApiOperation | OpenApiParameter[] | undefined>>
}

export type ApiParam = {
  name: string
  in: 'path' | 'query'
  required: boolean
  type: string
  example: string
}

export type ApiOperation = {
  id: string
  method: string
  path: string
  url: string
  title: string
  description: string
  group: string
  pathParams: ApiParam[]
  queryParams: ApiParam[]
  requestTs: string | null
  responseTs: string | null
  example: string
}

export type ApiGroup = {
  id: string
  title: string
  operations: ApiOperation[]
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const
const ACTIONS = new Set([
  'archive',
  'restore',
  'login',
  'logout',
  'duplicate',
  'move',
  'convert',
  'enable',
  'disable',
  'configure',
  'rotate',
  'enroll',
  'confirm',
  'import',
  'export',
  'validate',
  'evaluate',
  'fill',
  'sync',
  'connect',
  'callback',
  'webhook',
  'read',
  'order',
  'bulk',
  'bulk-delete',
  'reset-password',
  'change-password',
  'forgot-password',
  'csrf',
])

const GROUP_TITLES: Record<string, string> = {
  'api-keys': 'API keys',
  totp: 'TOTP',
}

const DESCRIPTIONS: Record<string, string> = {
  csrf: 'Get a CSRF token',
  health: 'Check API health',
  search: 'Search records',
  login: 'Sign in',
  logout: 'Sign out',
}

export const openApiSpec = spec as OpenApiSpec

export function apiBaseUrl(source: OpenApiSpec = openApiSpec) {
  return source.servers?.[0]?.url ?? '/api/v1'
}

export function schemaToTs(schema?: JsonSchema, indent = 0): string {
  if (!schema) return 'unknown'
  if (schema.enum?.length) return schema.enum.map((value) => JSON.stringify(value)).join(' | ')
  if (schema.anyOf?.length) return unique(schema.anyOf.map((item) => schemaToTs(item, indent))).join(' | ')
  if (schema.oneOf?.length) return unique(schema.oneOf.map((item) => schemaToTs(item, indent))).join(' | ')
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
  if (type === 'string') return 'string'
  if (type === 'number' || type === 'integer') return 'number'
  if (type === 'boolean') return 'boolean'
  if (type === 'array') return `${wrapUnion(schemaToTs(schema.items, indent))}[]`
  if (type === 'object' || schema.properties || schema.additionalProperties !== undefined) {
    const props = schema.properties ?? {}
    const keys = Object.keys(props)
    if (keys.length === 0) {
      if (typeof schema.additionalProperties === 'object') return `Record<string, ${schemaToTs(schema.additionalProperties, indent)}>`
      return 'Record<string, unknown>'
    }
    const required = new Set(schema.required ?? [])
    const pad = '  '.repeat(indent + 1)
    const close = '  '.repeat(indent)
    const lines = keys.map((key) => `${pad}${quoteKey(key)}${required.has(key) ? '' : '?'}: ${schemaToTs(props[key], indent + 1)};`)
    return `{\n${lines.join('\n')}\n${close}}`
  }
  return 'unknown'
}

export function compactType(ts: string) {
  return ts.replace(/\n\s*/g, ' ').replace(/;\s*}/g, ' }').replace(/{\s+/g, '{ ')
}

export function exampleValue(schema?: JsonSchema, name = ''): unknown {
  if (!schema) return 'value'
  if (schema.enum?.length) return schema.enum[0]
  if (schema.anyOf?.[0]) return exampleValue(schema.anyOf[0], name)
  if (schema.oneOf?.[0]) return exampleValue(schema.oneOf[0], name)
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
  if (type === 'boolean') return false
  if (type === 'number' || type === 'integer') return 1
  if (type === 'array') return [exampleValue(schema.items, name)]
  if (type === 'object' || schema.properties) {
    const required = schema.required ?? Object.keys(schema.properties ?? {})
    const body: Record<string, unknown> = {}
    for (const key of required) {
      if (schema.properties?.[key]) body[key] = exampleValue(schema.properties[key], key)
    }
    return body
  }
  const lower = name.toLowerCase()
  if (lower.includes('email') || lower === 'login') return 'admin@example.com'
  if (lower.includes('password')) return 'secret'
  if (lower === 'q') return 'acme'
  if (lower.endsWith('id') || lower === 'id') return exampleParam(name)
  return name || 'value'
}

export function describeOperation(method: string, path: string, summary?: string, description?: string) {
  const text = [summary, description].find((value) => value && value !== 'Default Response')
  if (text) return text
  const raw = path.split('/').filter(Boolean)
  const concrete = raw.filter((part) => !part.startsWith('{'))
  const last = concrete[concrete.length - 1] ?? 'resource'
  const parent = concrete[concrete.length - 2]
  const endsWithParam = raw[raw.length - 1]?.startsWith('{') ?? false
  if (DESCRIPTIONS[last]) return DESCRIPTIONS[last]
  if (ACTIONS.has(last)) {
    const target = parent && !['auth', 'totp'].includes(parent) ? singular(parent) : ''
    const verb = last.replace(/-/g, ' ')
    return target ? `${capitalize(verb)} ${article(target)} ${target}` : capitalize(verb)
  }
  const resource = singular(last).replace(/-/g, ' ')
  if (method === 'GET') {
    if (endsWithParam) return `Get ${article(resource)} ${resource}`
    if (last.endsWith('s') || last === 'search' || last === 'audit' || last === 'media') return `List ${last.replace(/-/g, ' ')}`
    return `Get ${resource}`
  }
  if (method === 'POST') return `Create ${article(resource)} ${resource}`
  if (method === 'PATCH') return `Update ${article(resource)} ${resource}`
  if (method === 'PUT') return parent ? `Replace ${singular(parent).replace(/-/g, ' ')} ${last.replace(/-/g, ' ')}` : `Replace ${resource}`
  if (method === 'DELETE') return `Delete ${article(resource)} ${resource}`
  return `${method} ${path}`
}

export function examplePath(path: string) {
  return path.replace(/\{([^}]+)\}/g, (_, name: string) => exampleParam(name, path))
}

export function needsCsrf(method: string) {
  return method !== 'GET' && method !== 'HEAD'
}

export function exampleCode(operation: Pick<ApiOperation, 'method' | 'path' | 'queryParams' | 'requestTs' | 'responseTs'> & {
  requestExample?: unknown
  examplePath?: string
}) {
  const path = `${operation.examplePath ?? examplePath(operation.path)}${exampleQuery(operation.queryParams)}`
  const typeArg = operation.responseTs ? `<${compactType(operation.responseTs)}>` : ''
  const lines: string[] = []
  if (needsCsrf(operation.method)) lines.push('await api.ensureCsrf()')
  if (operation.method === 'GET' || operation.method === 'HEAD') {
    lines.push(`const result = await api.request${typeArg}("${path}")`)
    return lines.join('\n')
  }
  const fields = [`  method: "${operation.method}"`]
  if (operation.requestExample !== undefined) {
    const json = indentBlock(JSON.stringify(operation.requestExample, null, 2), 2)
    fields.push(`  body: JSON.stringify(${json})`)
  }
  lines.push(`const result = await api.request${typeArg}("${path}", {\n${fields.join(',\n')},\n})`)
  return lines.join('\n')
}

export function listApiGroups(source: OpenApiSpec = openApiSpec): ApiGroup[] {
  const base = apiBaseUrl(source)
  const groups = new Map<string, ApiOperation[]>()
  for (const [path, item] of Object.entries(source.paths)) {
    for (const method of METHODS) {
      const operation = item[method]
      if (!operation || Array.isArray(operation)) continue
      const group = pathGroup(path)
      const parameters = (operation.parameters ?? []).filter((parameter): parameter is OpenApiParameter => Boolean(parameter?.name))
      const pathParams = parameters.filter((parameter) => parameter.in === 'path').map(toParam)
      const queryParams = parameters.filter((parameter) => parameter.in === 'query').map(toParam)
      const requestSchema = jsonSchema(operation.requestBody?.content)
      const responseSchema = responseJsonSchema(operation.responses)
      const requestTs = requestSchema ? schemaToTs(requestSchema) : null
      const responseTs = responseSchema ? schemaToTs(responseSchema) : null
      const requestExample = requestSchema ? exampleValue(requestSchema) : undefined
      const methodName = method.toUpperCase()
      const listed: ApiOperation = {
        id: headingId(`${method}-${path}`),
        method: methodName,
        path,
        url: `${base}${path}`,
        title: `${methodName} ${path}`,
        description: describeOperation(methodName, path, operation.summary, operation.description),
        group,
        pathParams,
        queryParams,
        requestTs,
        responseTs,
        example: exampleCode({
          method: methodName,
          path,
          queryParams,
          requestTs,
          responseTs,
          requestExample,
        }),
      }
      const bucket = groups.get(group) ?? []
      bucket.push(listed)
      groups.set(group, bucket)
    }
  }
  return [...groups.entries()].map(([id, operations]) => ({
    id,
    title: GROUP_TITLES[id] ?? capitalize(id.replace(/-/g, ' ')),
    operations,
  }))
}

function jsonSchema(content?: Record<string, { schema?: JsonSchema }>) {
  return content?.['application/json']?.schema
}

function responseJsonSchema(responses?: OpenApiOperation['responses']) {
  if (!responses) return undefined
  const preferred = ['200', '201', '204']
  for (const status of preferred) {
    const schema = jsonSchema(responses[status]?.content)
    if (schema) return schema
  }
  for (const response of Object.values(responses)) {
    const schema = jsonSchema(response.content)
    if (schema) return schema
  }
  return undefined
}

function toParam(parameter: OpenApiParameter): ApiParam {
  return {
    name: parameter.name,
    in: parameter.in === 'query' ? 'query' : 'path',
    required: Boolean(parameter.required),
    type: schemaToTs(parameter.schema),
    example: String(exampleValue(parameter.schema, parameter.name)),
  }
}

function exampleQuery(params: ApiParam[]) {
  if (params.length === 0) return ''
  const search = new URLSearchParams()
  for (const param of params) search.set(param.name, param.example)
  return `?${search.toString()}`
}

function exampleParam(name: string, path = '') {
  if (name.endsWith('Id')) return `${name.slice(0, -2)}_1`
  if (name === 'id') {
    const resource = path.split('/').find((part) => part && !part.startsWith('{')) ?? 'id'
    return `${singular(resource).replace(/\s+/g, '_')}_1`
  }
  return `${name}_1`
}

function pathGroup(path: string) {
  return path.split('/').find((part) => part && !part.startsWith('{')) ?? 'api'
}

function singular(value: string) {
  if (value === 'api-keys') return 'API key'
  if (value.endsWith('ies')) return `${value.slice(0, -3)}y`
  if (value.endsWith('s') && value.length > 1) return value.slice(0, -1)
  return value
}

function article(word: string) {
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

function capitalize(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value
}

function quoteKey(key: string) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)
}

function wrapUnion(value: string) {
  return value.includes('|') ? `(${value})` : value
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function indentBlock(value: string, spaces: number) {
  const pad = ' '.repeat(spaces)
  return value
    .split('\n')
    .map((line, index) => (index === 0 ? line : `${pad}${line}`))
    .join('\n')
}
