import type { PresenceFocus, PresencePerson } from '@datavalley/shared'
import { sameFocus } from '@datavalley/shared'

export type PresenceReport = {
  tableId: string | null
  tableName: string | null
  focus: PresenceFocus | null
  editing: boolean
  draft: string | null
}

export const emptyPresence: PresenceReport = {
  tableId: null,
  tableName: null,
  focus: null,
  editing: false,
  draft: null,
}

export function nextPresence(current: PresenceReport, patch: Partial<PresenceReport>): PresenceReport {
  const focus = patch.focus === undefined ? current.focus : patch.focus
  const same = sameFocus(current.focus, focus)
  return {
    tableId: patch.tableId === undefined ? current.tableId : patch.tableId,
    tableName: patch.tableName === undefined ? current.tableName : patch.tableName,
    focus,
    editing: patch.editing === undefined ? current.editing : patch.editing,
    draft: patch.draft !== undefined ? patch.draft : same ? current.draft : null,
  }
}

export function mergePresence(current: PresencePerson[], upsert: PresencePerson[], remove: string[]) {
  const gone = new Set(remove)
  const next = current.filter((person) => !gone.has(person.userId))
  for (const person of upsert) {
    const index = next.findIndex((item) => item.userId === person.userId)
    if (index >= 0) next[index] = person
    else next.push(person)
  }
  return next
}

export function cellPeers(people: PresencePerson[], tableId: string, rowId: string, columnId: string) {
  return people.filter(
    (person) =>
      person.focus?.kind === 'cell' &&
      person.focus.tableId === tableId &&
      person.focus.rowId === rowId &&
      person.focus.columnId === columnId,
  )
}

export function rowRemoteKey(people: PresencePerson[], tableId: string, rowId: string) {
  return people
    .filter((person) => person.focus?.kind === 'cell' && person.focus.tableId === tableId && person.focus.rowId === rowId)
    .map((person) => {
      const focus = person.focus
      if (focus?.kind !== 'cell') return ''
      return `${person.userId}:${focus.columnId}:${person.editing ? 1 : 0}:${person.draft ?? ''}`
    })
    .join('|')
}

type Send = (projectId: string, body: PresenceReport & { clear?: boolean }) => void

export function createPresenceReporter(send: Send, now: () => number = () => Date.now()) {
  let projectId = ''
  let latest = emptyPresence
  let timer: ReturnType<typeof setTimeout> | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let lastSent = 0

  function flush() {
    if (timer) clearTimeout(timer)
    timer = null
    if (!projectId) return
    lastSent = now()
    send(projectId, latest)
  }

  function schedule(delay: number) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => flush(), delay)
  }

  return {
    bind(id: string) {
      projectId = id
      if (heartbeat) clearInterval(heartbeat)
      heartbeat = setInterval(() => flush(), 4_000)
    },
    report(patch: Partial<PresenceReport>) {
      const previous = latest
      latest = nextPresence(latest, patch)
      const drafting = latest.editing && latest.draft != null && latest.draft !== previous.draft
      const wait = drafting ? Math.max(0, 150 - (now() - lastSent)) : 0
      schedule(wait)
    },
    unbind() {
      if (timer) clearTimeout(timer)
      timer = null
      if (heartbeat) clearInterval(heartbeat)
      heartbeat = null
      const id = projectId
      projectId = ''
      latest = emptyPresence
      if (id) send(id, { ...emptyPresence, clear: true })
    },
    current() {
      return latest
    },
  }
}
