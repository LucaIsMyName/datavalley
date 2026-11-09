import { and, eq, sql } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { tableRows } from '../../database/schema.js'

type RowRecord = typeof tableRows.$inferSelect

export type RowVersionResult = { status: 'saved'; row: RowRecord } | { status: 'conflict'; row: RowRecord } | { status: 'missing' }

/** `cell_versions` keys for row fields that are not cells. Cells use their column id. */
export const rowFieldKeys = {
  color: '$color',
  notes: '$notes',
  background: (columnId: string) => `$bg:${columnId}`,
  format: (columnId: string) => `$fmt:${columnId}`,
}

const MAX_ATTEMPTS = 5

/** True when any of `keys` was written after `version`. Keys written before this tracking existed count as version 0. */
export function changedSince(cellVersions: Record<string, number>, keys: string[], version: number) {
  return keys.some((key) => (cellVersions[key] ?? 0) > version)
}

/**
 * Bumps the row version and stamps `keys` with the new version.
 *
 * With an `expected` version, a stale write is still applied when none of its keys changed after `expected`,
 * so two people can edit different cells of one row. Without one (automations), the write always applies.
 */
export async function advanceRowVersion(
  db: AppDatabase,
  rowId: string,
  expected: number | null,
  keys: string[],
  fields: Partial<Pick<RowRecord, 'color' | 'notes'>> = {},
): Promise<RowVersionResult> {
  let base = expected
  let latest: RowRecord | undefined
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (base === null) {
      ;[latest] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
      if (!latest) return { status: 'missing' }
      base = latest.version
    }
    const next = base + 1
    const stamp = JSON.stringify(Object.fromEntries(keys.map((key) => [key, next])))
    const [updated] = await db
      .update(tableRows)
      .set({
        ...fields,
        version: next,
        cellVersions: sql`${tableRows.cellVersions} || ${stamp}::jsonb`,
        updatedAt: new Date(),
      })
      .where(and(eq(tableRows.id, rowId), eq(tableRows.version, base)))
      .returning()
    if (updated) return { status: 'saved', row: updated }
    ;[latest] = await db.select().from(tableRows).where(eq(tableRows.id, rowId)).limit(1)
    if (!latest) return { status: 'missing' }
    if (expected !== null && (expected > latest.version || changedSince(latest.cellVersions, keys, expected))) {
      return { status: 'conflict', row: latest }
    }
    base = latest.version
  }
  return latest ? { status: 'conflict', row: latest } : { status: 'missing' }
}
