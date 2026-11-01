import { Type, type Static } from '@sinclair/typebox'

export const ConnectorFieldSchema = Type.Object({
  sourceKey: Type.String({ minLength: 1 }),
  targetFieldKey: Type.String({ minLength: 1 }),
  targetLabel: Type.Optional(Type.String()),
  coerce: Type.Optional(Type.Union([
    Type.Literal('text'),
    Type.Literal('number'),
    Type.Literal('boolean'),
    Type.Literal('date'),
  ])),
})

export const ConnectorParseConfigSchema = Type.Object({
  version: Type.Literal(1),
  recordsPath: Type.Optional(Type.String()),
  externalIdPath: Type.Optional(Type.String()),
  fields: Type.Array(ConnectorFieldSchema),
  csv: Type.Optional(Type.Object({
    delimiter: Type.Optional(Type.String()),
    headerRow: Type.Optional(Type.Boolean()),
  })),
})

export type ConnectorParseConfig = Static<typeof ConnectorParseConfigSchema>

export const ConnectorSourceSchema = Type.Object({
  baseUrl: Type.String({ minLength: 1 }),
  pathTemplate: Type.Optional(Type.String()),
  method: Type.Optional(Type.Union([Type.Literal('GET'), Type.Literal('POST')])),
  query: Type.Optional(Type.Record(Type.String(), Type.String())),
  headers: Type.Optional(Type.Record(Type.String(), Type.String())),
})

export const ConnectorAuthSchema = Type.Object({
  type: Type.Union([
    Type.Literal('none'),
    Type.Literal('api_key_header'),
    Type.Literal('api_key_query'),
  ]),
  headerName: Type.Optional(Type.String()),
  queryParam: Type.Optional(Type.String()),
})

export const ConnectorScheduleSchema = Type.Object({
  preset: Type.Union([
    Type.Literal('manual'),
    Type.Literal('hourly'),
    Type.Literal('daily'),
    Type.Literal('weekly'),
  ]),
  cron: Type.Optional(Type.String()),
  timezone: Type.Optional(Type.String()),
})

export const ConnectorRetentionSchema = Type.Object({
  mode: Type.Union([Type.Literal('forever'), Type.Literal('drop_missing')]),
  missingAfterDays: Type.Optional(Type.Integer({ minimum: 1 })),
})

export const ConnectorFormatSchema = Type.Union([
  Type.Literal('json'),
  Type.Literal('csv'),
  Type.Literal('xml'),
  Type.Literal('html'),
])
