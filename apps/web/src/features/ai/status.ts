import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

export function aiControlsVisible(status: { enabled: boolean } | undefined) {
  return status?.enabled === true
}

export function useAiStatus() {
  return useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api.request<{ enabled: boolean }>('/ai/status'),
    staleTime: 30_000,
  })
}

export function useAiEnabled() {
  const status = useAiStatus()
  return aiControlsVisible(status.data)
}
