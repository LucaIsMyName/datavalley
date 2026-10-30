import { Type } from '@sinclair/typebox'

export const loginBody = Type.Object({
  login: Type.String({ minLength: 1 }),
  password: Type.String({ minLength: 1 }),
  totpCode: Type.Optional(Type.String()),
})

export const changePasswordBody = Type.Object({
  currentPassword: Type.String({ minLength: 1 }),
  newPassword: Type.String({ minLength: 12 }),
})

export const userResponse = Type.Object({
  id: Type.String(),
  username: Type.String(),
  email: Type.String(),
  role: Type.String(),
  disabled: Type.Boolean(),
  mustChangePassword: Type.Boolean(),
  locale: Type.String(),
  timezone: Type.String(),
  theme: Type.String(),
  createdAt: Type.String(),
})
