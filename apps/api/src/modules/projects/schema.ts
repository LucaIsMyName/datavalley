import { actions } from '@datavalley/shared'
import { Type } from '@sinclair/typebox'

const uuid = Type.String({ minLength: 36, maxLength: 36 })

const actionSchema = Type.Union(actions.map((action) => Type.Literal(action)))

export const grantEntry = Type.Object({
  action: actionSchema,
  effect: Type.Union([Type.Literal('allow'), Type.Literal('deny')]),
})

export const projectIdParams = Type.Object({
  id: uuid,
})

export const projectMemberParams = Type.Object({
  id: uuid,
  userId: uuid,
})

export const listProjectsQuery = Type.Object({
  includeArchived: Type.Optional(Type.String()),
})

export const createProjectBody = Type.Object({
  name: Type.String({ minLength: 1 }),
  template: Type.Optional(Type.Union([Type.Literal('blank'), Type.Literal('customers')])),
})

export const patchProjectBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  description: Type.Optional(Type.String()),
  settings: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  icon: Type.Optional(Type.String()),
})

export const addMemberBody = Type.Object({
  username: Type.String({ minLength: 1 }),
})

export const setMemberDisabledBody = Type.Object({
  disabled: Type.Boolean(),
})

export const projectPermissionsBody = Type.Object({
  userId: uuid,
  grants: Type.Array(grantEntry),
})

export const directoryQuery = Type.Object({
  q: Type.Optional(Type.String()),
})
