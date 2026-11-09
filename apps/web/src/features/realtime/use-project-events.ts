import { useQueryClient } from '@tanstack/react-query'
import type { RealtimeEvent } from '@datavalley/shared'
import { useEffect } from 'react'
import { useSession } from '../../stores/session.js'
import { applyRealtimeEvent } from './apply.js'
import { bindPresenceProject, receivePresence, unbindPresenceProject } from './presence-store.js'

/** Parses one SSE payload. A malformed message is dropped so it cannot stop later events from being handled. */
export function parseRealtimeEvent(data: unknown): RealtimeEvent | null {
  if (typeof data !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(data)
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as { type?: unknown }).type !== 'string') return null
    return parsed as RealtimeEvent
  } catch {
    return null
  }
}

export function useProjectEvents(projectId: string) {
  const queryClient = useQueryClient()
  const userId = useSession((state) => state.user?.id ?? '')
  useEffect(() => {
    if (!projectId || !userId) return
    bindPresenceProject(projectId)
    const source = new EventSource(`/api/v1/projects/${projectId}/events`, { withCredentials: true })
    let opens = 0
    source.onopen = () => {
      opens += 1
      if (opens === 1) return
      void queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['tables', projectId] })
      void queryClient.invalidateQueries({ queryKey: ['rows'] })
      void queryClient.invalidateQueries({ queryKey: ['table'] })
    }
    source.onmessage = (message) => {
      const event = parseRealtimeEvent(message.data)
      if (!event) return
      if (event.type === 'presence') {
        receivePresence(event.upsert, event.remove, userId)
        return
      }
      applyRealtimeEvent(queryClient, event, userId)
    }
    return () => {
      source.close()
      unbindPresenceProject()
    }
  }, [projectId, queryClient, userId])
}
