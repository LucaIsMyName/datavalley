import { ApiClientError } from '@datavalley/api-client'

/** Toast copy for a failed edit. A 400 cell save stays on the cell, so that returns null. */
export function editFailureMessage(
  error: unknown,
  fallback: string,
  options?: { cell?: boolean },
): string | null {
  if (options?.cell && error instanceof ApiClientError && error.status === 400) return null
  if (options?.cell) return fallback
  if (error instanceof Error && error.message) return error.message
  return fallback
}
