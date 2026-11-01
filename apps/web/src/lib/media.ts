import { useQuery } from '@tanstack/react-query'
import type { MediaDetailsResponse, MediaFile, MediaListResponse } from '@datavalley/api-client'
import { api } from './api'

export const MEDIA_UPLOAD_ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp,image/svg+xml,application/pdf,text/plain'

export function mediaDownloadUrl(id: string) {
  return `/api/v1/media/${id}`
}

export function isRasterImageMime(mime: string) {
  return mime.startsWith('image/') && mime !== 'image/svg+xml'
}

export function isPdfMime(mime: string) {
  return mime === 'application/pdf'
}

export function formatMediaBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export async function uploadMedia(file: File, options?: { tableId?: string }) {
  const params = options?.tableId ? `?tableId=${encodeURIComponent(options.tableId)}` : ''
  const body = new FormData()
  body.append('file', file)
  const result = await api.request<{ file: MediaFile }>(`/media${params}`, { method: 'POST', body })
  return result.file
}

export async function fetchMediaDetails(id: string) {
  return api.request<MediaDetailsResponse>(`/media/${id}/details`)
}

export function useMediaCatalog() {
  return useQuery({
    queryKey: ['media', 'catalog'],
    queryFn: () => listMedia({ limit: 100 }),
    staleTime: 60_000,
  })
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
