import { Type } from '@sinclair/typebox'
import { grantEntry } from '../projects/schema.js'

const uuid = Type.String({ minLength: 36, maxLength: 36 })

export const userIdParams = Type.Object({
  id: uuid,
})

export const listUsersQuery = Type.Object({
  offset: Type.Optional(Type.String()),
  limit: Type.Optional(Type.String()),
})

export const patchUserBody = Type.Object({
  role: Type.Optional(Type.Union([Type.Literal('admin'), Type.Literal('user')])),
  locale: Type.Optional(Type.String({ minLength: 1 })),
  timezone: Type.Optional(Type.String({ minLength: 1 })),
  theme: Type.Optional(Type.Union([Type.Literal('light'), Type.Literal('dark'), Type.Literal('system')])),
})

export const resetUserPasswordBody = Type.Object({
  password: Type.String({ minLength: 12 }),
})

export const systemPermissionsBody = Type.Object({
  grants: Type.Array(grantEntry),
})
