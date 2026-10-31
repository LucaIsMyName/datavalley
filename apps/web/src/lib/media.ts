import type { MediaFile, MediaListResponse } from '@datavalley/api-client'
import { api } from './api'

export function mediaDownloadUrl(id: string) {
  return `/api/v1/media/${id}`
}

export function isRasterImageMime(mime: string) {
  return mime.startsWith('image/') && mime !== 'image/svg+xml'
}

export async function uploadMedia(file: File, options?: { tableId?: string }) {
  const params = options?.tableId ? `?tableId=${encodeURIComponent(options.tableId)}` : ''
  const body = new FormData()
  body.append('file', file)
  const result = await api.request<{ file: MediaFile }>(`/media${params}`, { method: 'POST', body })
  return result.file
}

export async function listMedia(query: { limit?: number; cursor?: string | null; q?: string; mime?: 'image' | 'pdf' | null }) {
  const params = new URLSearchParams()
  if (query.limit) params.set('limit', String(query.limit))
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.q) params.set('q', query.q)
  if (query.mime) params.set('mime', query.mime)
  const suffix = params.size ? `?${params}` : ''
  return api.request<MediaListResponse>(`/media${suffix}`)
}
