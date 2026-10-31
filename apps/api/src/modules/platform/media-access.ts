import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../../database/client.js'
import { mediaFiles, type mediaFiles as MediaFilesTable } from '../../database/schema.js'
import { notFound, unauthorized } from '../../errors.js'
import type { Subject } from '../../security/subject.js'
import { requireTable } from '../tables/service.js'

export type MediaFileRow = typeof MediaFilesTable.$inferSelect

export async function canReadMedia(db: AppDatabase, subject: Subject, file: MediaFileRow) {
  if (!subject.user) return false
  if (file.organizationId !== subject.user.organizationId) return false
  if (file.tableId) {
    try {
      await requireTable(db, subject, file.tableId, 'view')
      return true
    } catch {
      return false
    }
  }
  if (subject.role === 'admin') return true
  return file.createdBy === subject.id
}

export async function assertMediaReadable(db: AppDatabase, subject: Subject, file: MediaFileRow) {
  if (!subject.user) throw unauthorized()
  if (!(await canReadMedia(db, subject, file))) throw notFound()
}

export async function loadMediaFile(db: AppDatabase, id: string) {
  const [file] = await db.select().from(mediaFiles).where(eq(mediaFiles.id, id)).limit(1)
  return file ?? null
}
