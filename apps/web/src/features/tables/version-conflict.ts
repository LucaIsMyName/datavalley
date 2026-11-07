import { ApiClientError, type RowRecord } from '@datavalley/api-client'

export function rowFromVersionConflict(error: unknown): RowRecord | null {
  if (!(error instanceof ApiClientError) || error.status !== 409 || error.code !== 'version_conflict') return null
  const details = (error.body as { error?: { details?: { row?: RowRecord } } }).error?.details
  return details?.row ?? null
}
