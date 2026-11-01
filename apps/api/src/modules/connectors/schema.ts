import { Type } from '@sinclair/typebox'
import {
  ConnectorAuthSchema,
  ConnectorFormatSchema,
  ConnectorParseConfigSchema,
  ConnectorRetentionSchema,
  ConnectorScheduleSchema,
  ConnectorSourceSchema,
} from '@datavalley/shared'

export const connectorIdParams = Type.Object({ id: Type.String({ format: 'uuid' }) })

export const listConnectorsQuery = Type.Object({
  projectId: Type.Optional(Type.String({ format: 'uuid' })),
})

export const createConnectorBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  icon: Type.Optional(Type.String()),
  projectId: Type.Optional(Type.Union([Type.String({ format: 'uuid' }), Type.Null()])),
  enabled: Type.Optional(Type.Boolean()),
  source: ConnectorSourceSchema,
  auth: Type.Optional(ConnectorAuthSchema),
  format: ConnectorFormatSchema,
  parse: ConnectorParseConfigSchema,
  schedule: Type.Optional(ConnectorScheduleSchema),
  retention: Type.Optional(ConnectorRetentionSchema),
  apiKey: Type.Optional(Type.String()),
})

export const patchConnectorBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  icon: Type.Optional(Type.String()),
  projectId: Type.Optional(Type.Union([Type.String({ format: 'uuid' }), Type.Null()])),
  enabled: Type.Optional(Type.Boolean()),
  source: Type.Optional(ConnectorSourceSchema),
  auth: Type.Optional(ConnectorAuthSchema),
  format: Type.Optional(ConnectorFormatSchema),
  parse: Type.Optional(ConnectorParseConfigSchema),
  schedule: Type.Optional(ConnectorScheduleSchema),
  retention: Type.Optional(ConnectorRetentionSchema),
  apiKey: Type.Optional(Type.String()),
})

export const previewConnectorBody = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
})

export const syncConnectorBody = Type.Object({
  tableId: Type.Optional(Type.String({ format: 'uuid' })),
})

export const bindConnectorBody = Type.Object({
  tableId: Type.String({ format: 'uuid' }),
})

export const tableIdParams = Type.Object({ tableId: Type.String({ format: 'uuid' }) })

export const patchBindingBody = Type.Object({
  columnMap: Type.Record(Type.String(), Type.String({ format: 'uuid' })),
  syncMode: Type.Optional(Type.Union([Type.Literal('append_only'), Type.Literal('upsert')])),
})

export const fromConnectorBody = Type.Object({
  connectorId: Type.String({ format: 'uuid' }),
  name: Type.Optional(Type.String()),
  icon: Type.Optional(Type.String()),
})
