import { useQueryClient } from '@tanstack/react-query'
import type { RealtimeEvent } from '@datavalley/shared'
import { useEffect } from 'react'
import { useSession } from '../../stores/session.js'
import { applyRealtimeEvent } from './apply.js'
import { bindPresenceProject, receivePresence, unbindPresenceProject } from './presence-store.js'

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
      const event = JSON.parse(message.data) as RealtimeEvent
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
