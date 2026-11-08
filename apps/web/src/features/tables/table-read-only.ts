import type { TableRecord } from '@datavalley/api-client'

export type TableReadOnlyReason = 'locked' | 'mirror' | 'connector' | null

export function tableReadOnlyReason(
  table: Pick<TableRecord, 'lockedAt' | 'mirrorOfTableId' | 'connector'> | null | undefined,
): TableReadOnlyReason {
  if (!table) return null
  if (table.mirrorOfTableId) return 'mirror'
  if (table.connector) return 'connector'
  if (table.lockedAt) return 'locked'
  return null
}

export function isTableReadOnly(
  table: Pick<TableRecord, 'lockedAt' | 'mirrorOfTableId' | 'connector'> | null | undefined,
) {
  return tableReadOnlyReason(table) !== null
}
