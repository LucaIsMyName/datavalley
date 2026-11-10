import { eq, inArray } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { relationRecords, relations } from '../../database/schema.js'

/** A restrict relation that still points at the row must keep the row, including during connector retention. */
export async function rowDeleteRestriction(db: AppDatabase, rowId: string) {
  const links = await db.select().from(relationRecords).where(eq(relationRecords.toRowId, rowId))
  if (links.length === 0) return { restricted: false, references: 0 }
  const related = await db
    .select()
    .from(relations)
    .where(
      inArray(
        relations.id,
        links.map((link) => link.relationId),
      ),
    )
  const restricted = related.some(
    (relation) =>
      relation.onDelete === 'restrict' && links.some((link) => link.relationId === relation.id),
  )
  return { restricted, references: links.length }
}
