export const MAX_MEDIA_FILES_PER_CELL = 20

export type MediaCellValue = { fileIds: string[] }

export function normalizeMediaCellValue(raw: unknown): MediaCellValue | null {
  if (raw == null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if ('fileIds' in record) {
    const ids = record.fileIds
    if (!Array.isArray(ids)) return null
    const fileIds = [...new Set(ids.map(String).filter(Boolean))]
    return fileIds.length ? { fileIds } : null
  }
  if ('fileId' in record && record.fileId != null && String(record.fileId).trim()) {
    return { fileIds: [String(record.fileId)] }
  }
  return null
}

export function parseMediaCellInput(input: unknown): MediaCellValue | null {
  if (input == null || input === '') return null
  const normalized = normalizeMediaCellValue(input)
  if (!normalized) throw new Error('invalid_media_cell')
  if (normalized.fileIds.length > MAX_MEDIA_FILES_PER_CELL) throw new Error('too_many_media_files')
  return normalized
}
