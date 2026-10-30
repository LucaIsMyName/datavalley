export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function notFound(message = 'Resource not found') {
  return new AppError(404, 'not_found', message)
}

export function badRequest(message: string, details?: unknown) {
  return new AppError(400, 'validation_error', message, details)
}

export function conflict(message: string, details?: unknown) {
  return new AppError(409, 'conflict', message, details)
}

export function unauthorized(message = 'Authentication required') {
  return new AppError(401, 'unauthorized', message)
}
