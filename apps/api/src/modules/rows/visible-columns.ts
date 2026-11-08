import type { AppDatabase } from '../../database/client.js'
import { allows, resolveGrants } from '../../security/access.js'
import type { Subject } from '../../security/subject.js'
import type { LoadedColumn } from '../tables/service.js'

export async function visibleColumns(
  db: AppDatabase,
  subject: Subject,
  tableId: string,
  projectId: string,
  columns: LoadedColumn[],
) {
  const grants = await resolveGrants(db, subject)
  return columns.filter((column) =>
    allows(subject, grants, 'view', {
      type: 'column',
      id: column.id,
      parents: { table: tableId, project: projectId },
    }),
  )
}
