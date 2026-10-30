export const errorCodes = {
  validationError: 'validation_error',
  unauthorized: 'unauthorized',
  notFound: 'not_found',
  conflict: 'conflict',
  rateLimited: 'rate_limited',
  locked: 'locked',
  passwordChangeRequired: 'password_change_required',
  totpRequired: 'totp_required',
  forbidden: 'forbidden',
  csrfInvalid: 'csrf_invalid',
  internalError: 'internal_error',
  redisRequired: 'redis_required',
  payloadTooLarge: 'payload_too_large',
  unsupportedMedia: 'unsupported_media',
  pluginDisabled: 'plugin_disabled',
  configurationMissing: 'configuration_missing',
} as const

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes]

export type ApiErrorBody = {
  error: {
    code: string
    message: string
    details?: unknown
  }
}
