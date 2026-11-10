import { ApiClientError } from '@datavalley/api-client'

/** Toast copy for a failed edit. A 400 cell save stays on the cell, so that returns null. */
export function editFailureMessage(
  error: unknown,
  fallback: string,
  options?: { cell?: boolean },
): string | null {
  if (options?.cell && error instanceof ApiClientError && error.status === 400) return null
  // The cell editor already shows the version-conflict toast before this fallback runs.
  if (options?.cell && isVersionConflict(error)) return null
  if (options?.cell) return fallback
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function isVersionConflict(error: unknown) {
  if (error instanceof ApiClientError && error.status === 409 && error.code === 'version_conflict') return true
  return error instanceof Error && error.message === 'version_conflict'
}
