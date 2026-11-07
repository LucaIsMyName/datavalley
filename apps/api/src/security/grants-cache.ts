import type { Grant } from '@datavalley/shared'
import type { Subject } from './subject.js'

const TTL_MS = 5_000

type Entry = { grants: Grant[]; expires: number }

const bySubject = new Map<string, Entry>()

function subjectKey(subject: Pick<Subject, 'kind' | 'id'>) {
  return `${subject.kind}:${subject.id}`
}

export function readGrantsCache(subject: Pick<Subject, 'kind' | 'id'>): Grant[] | null {
  const hit = bySubject.get(subjectKey(subject))
  if (!hit || hit.expires <= Date.now()) return null
  return hit.grants
}

export function writeGrantsCache(subject: Pick<Subject, 'kind' | 'id'>, grants: Grant[]) {
  bySubject.set(subjectKey(subject), { grants, expires: Date.now() + TTL_MS })
}

export function invalidateGrantsCache(subject?: Pick<Subject, 'kind' | 'id'>) {
  if (!subject) {
    bySubject.clear()
    return
  }
  bySubject.delete(subjectKey(subject))
}
