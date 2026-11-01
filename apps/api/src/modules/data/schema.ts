import { Type } from '@sinclair/typebox'

const uuid = Type.String({ minLength: 36, maxLength: 36 })

export const createTableBody = Type.Object({
  name: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  template: Type.Optional(Type.Literal('demo')),
})

export const mirrorTableBody = Type.Object({
  sourceTableId: uuid,
  name: Type.Optional(Type.String()),
})

export const reorderIdsBody = Type.Object({
  tableIds: Type.Array(uuid, { minItems: 1 }),
})

export const reorderColumnsBody = Type.Object({
  columnIds: Type.Array(uuid, { minItems: 1 }),
})

export const patchTableBody = Type.Object({
  name: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  icon: Type.Optional(Type.String()),
  headerConfig: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  footerConfig: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  formatRules: Type.Optional(Type.Array(Type.Unknown())),
})

export const moveTableBody = Type.Object({
  projectId: uuid,
})

export const duplicateTableBody = Type.Object({
  includeData: Type.Optional(Type.Boolean()),
})

export const convertColumnBody = Type.Object({
  type: Type.String({ minLength: 1 }),
  dryRun: Type.Optional(Type.Boolean()),
})

export const relationBody = Type.Object({
  toTableId: uuid,
  cardinality: Type.String({ minLength: 1 }),
})

export const duplicateColumnsBody = Type.Object({
  columnIds: Type.Array(uuid, { minItems: 1 }),
})

export const listRowsQuery = Type.Object({
  limit: Type.Optional(Type.String()),
  cursor: Type.Optional(Type.String()),
  q: Type.Optional(Type.String()),
  sort: Type.Optional(Type.String()),
  direction: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')])),
  filter: Type.Optional(Type.String()),
})

export const createRowBody = Type.Object({
  cells: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  beforeId: Type.Optional(uuid),
  afterId: Type.Optional(uuid),
})

export const moveRowBody = Type.Object({
  rowId: uuid,
  beforeId: Type.Optional(uuid),
  afterId: Type.Optional(uuid),
})

export const patchRowBody = Type.Object({
  version: Type.Integer({ minimum: 0 }),
  cells: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  color: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  backgrounds: Type.Optional(Type.Record(Type.String(), Type.Union([Type.String(), Type.Null()]))),
  formats: Type.Optional(Type.Record(Type.String(), Type.Array(Type.Unknown()))),
  notes: Type.Optional(Type.String()),
})

export const bulkPatchBody = Type.Object({
  updates: Type.Array(
    Type.Object({
      rowId: uuid,
      version: Type.Integer({ minimum: 0 }),
      cells: Type.Record(Type.String(), Type.Unknown()),
    }),
    { minItems: 1 },
  ),
})

export const rowIdsBody = Type.Object({
  rowIds: Type.Array(uuid, { minItems: 1 }),
})

export const fillDownBody = Type.Object({
  columnId: uuid,
  rowIds: Type.Array(uuid, { minItems: 1 }),
})

export const catalogNameBody = Type.Object({
  name: Type.String({ minLength: 1 }),
})

export const catalogPatchBody = Type.Object({
  color: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
})

export const exportTableBody = Type.Object({
  filter: Type.Optional(Type.Unknown()),
})

export const tableStateBody = Type.Object({
  sort: Type.Optional(Type.Unknown()),
  filter: Type.Optional(Type.Unknown()),
})

export const compileConditionBody = Type.Object({
  expression: Type.Optional(Type.String()),
})

export const formulaValidateBody = Type.Object({
  tableId: uuid,
  expression: Type.String(),
  rowId: Type.Optional(uuid),
})

export const mediaUploadQuery = Type.Object({
  tableId: Type.Optional(uuid),
})

export const mediaListQuery = Type.Object({
  limit: Type.Optional(Type.String()),
  cursor: Type.Optional(Type.String()),
  q: Type.Optional(Type.String()),
  mime: Type.Optional(Type.Union([Type.Literal('image'), Type.Literal('pdf')])),
})

export const mediaParams = Type.Object({
  id: uuid,
})
