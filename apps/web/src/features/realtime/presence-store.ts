import { useSyncExternalStore } from 'react'
import type { PresencePerson } from '@datavalley/shared'
import { api } from '../../lib/api.js'
import { createPresenceReporter, mergePresence, type PresenceReport } from './presence.js'

let people: PresencePerson[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function setPresencePeople(next: PresencePerson[]) {
  people = next
  emit()
}

export function usePresencePeople() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => people,
  )
}

function postPresence(projectId: string, body: PresenceReport & { clear?: boolean }) {
  void api
    .request(`/projects/${projectId}/presence`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    .catch(() => undefined)
}

export const presenceReporter = createPresenceReporter(postPresence)

export function bindPresenceProject(projectId: string) {
  presenceReporter.bind(projectId)
}

export function reportPresence(patch: Partial<PresenceReport>) {
  presenceReporter.report(patch)
}

export function unbindPresenceProject() {
  presenceReporter.unbind()
  setPresencePeople([])
}

export function receivePresence(upsert: PresencePerson[], remove: string[], selfId: string) {
  setPresencePeople(mergePresence(people, upsert, remove).filter((person) => person.userId !== selfId))
}
