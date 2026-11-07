import { Redis } from 'ioredis'
import { filterRealtimeEvent, type PresencePerson, type RealtimeDraft, type RealtimeEvent, type RealtimeViewer } from '@datavalley/shared'

const PRESENCE_TTL_MS = 10_000
const HISTORY_LIMIT = 100
const CHANNEL = 'dv:realtime'

export type RealtimeViewerConnection = RealtimeViewer & {
  id: string
  userId: string
  send: (event: RealtimeEvent) => void
}

type PresenceRecord = {
  person: PresencePerson
  seenAt: number
  local: boolean
}

type RedisEnvelope = {
  origin: string
  projectId: string
  event: RealtimeEvent
}

export type RealtimeHub = ReturnType<typeof createRealtimeHub>

let activeHub: RealtimeHub | null = null

export function bindRealtimeHub(hub: RealtimeHub | null) {
  activeHub = hub
}

export function getRealtimeHub() {
  return activeHub
}

export function createRealtimeHub(options: { redisUrl?: string | null; now?: () => number; sweepMs?: number } = {}) {
  const origin = crypto.randomUUID()
  const now = options.now ?? (() => Date.now())
  const rooms = new Map<string, Map<string, RealtimeViewerConnection>>()
  const presence = new Map<string, Map<string, PresenceRecord>>()
  const history = new Map<string, RealtimeEvent[]>()
  let seq = 0
  let redisPub: Redis | null = null
  let redisSub: Redis | null = null
  const url = options.redisUrl?.trim()
  if (url) {
    redisPub = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false })
    redisSub = new Redis(url, { maxRetriesPerRequest: null })
    redisSub.subscribe(CHANNEL).catch(() => undefined)
    redisSub.on('message', (_channel, raw) => {
      try {
        const message = JSON.parse(raw) as RedisEnvelope
        if (!message?.event || message.origin === origin) return
        if (message.event.type === 'presence') applyPresence(message.projectId, message.event, false)
        deliver(message.projectId, message.event)
      } catch {
        return
      }
    })
  }

  function nextId() {
    seq += 1
    return String(seq)
  }

  function room(projectId: string) {
    const current = rooms.get(projectId)
    if (current) return current
    const created = new Map<string, RealtimeViewerConnection>()
    rooms.set(projectId, created)
    return created
  }

  function peopleMap(projectId: string) {
    const current = presence.get(projectId)
    if (current) return current
    const created = new Map<string, PresenceRecord>()
    presence.set(projectId, created)
    return created
  }

  function applyPresence(projectId: string, event: Extract<RealtimeEvent, { type: 'presence' }>, local: boolean) {
    const map = peopleMap(projectId)
    for (const userId of event.remove) map.delete(userId)
    for (const person of event.upsert) map.set(person.userId, { person, seenAt: now(), local })
  }

  function remember(projectId: string, event: RealtimeEvent) {
    const list = history.get(projectId) ?? []
    list.push(event)
    if (list.length > HISTORY_LIMIT) list.shift()
    history.set(projectId, list)
  }

  function deliver(projectId: string, event: RealtimeEvent) {
    remember(projectId, event)
    const viewers = rooms.get(projectId)
    if (!viewers) return
    for (const viewer of viewers.values()) {
      const filtered = filterRealtimeEvent(event, viewer)
      if (filtered) viewer.send(filtered)
    }
  }

  function publish(projectId: string, draft: RealtimeDraft) {
    const event = { ...draft, id: nextId() } as RealtimeEvent
    if (event.type === 'presence') applyPresence(projectId, event, true)
    deliver(projectId, event)
    if (redisPub) {
      const envelope: RedisEnvelope = { origin, projectId, event }
      void redisPub.publish(CHANNEL, JSON.stringify(envelope)).catch(() => undefined)
    }
    return event
  }

  function subscribe(projectId: string, viewer: RealtimeViewerConnection) {
    room(projectId).set(viewer.id, viewer)
    return () => {
      const viewers = rooms.get(projectId)
      viewers?.delete(viewer.id)
      if (viewers && viewers.size === 0) rooms.delete(projectId)
    }
  }

  function since(projectId: string, lastId: string | undefined) {
    if (!lastId) return []
    const list = history.get(projectId) ?? []
    const index = list.findIndex((event) => event.id === lastId)
    if (index < 0) return []
    return list.slice(index + 1)
  }

  function people(projectId: string) {
    return [...(presence.get(projectId)?.values() ?? [])].map((record) => record.person)
  }

  function setPresence(projectId: string, person: PresencePerson) {
    return publish(projectId, { type: 'presence', actorId: person.userId, projectId, upsert: [person], remove: [] })
  }

  function clearPresence(projectId: string, userId: string) {
    return publish(projectId, { type: 'presence', actorId: userId, projectId, upsert: [], remove: [userId] })
  }

  function sweep() {
    const clock = now()
    for (const [projectId, map] of presence) {
      const owned: string[] = []
      const replicas: string[] = []
      for (const [userId, record] of map) {
        if (clock - record.seenAt <= PRESENCE_TTL_MS) continue
        map.delete(userId)
        if (record.local) owned.push(userId)
        else replicas.push(userId)
      }
      if (owned.length) publish(projectId, { type: 'presence', actorId: 'system', projectId, upsert: [], remove: owned })
      if (replicas.length) {
        deliver(projectId, {
          id: nextId(),
          type: 'presence',
          actorId: 'system',
          projectId,
          upsert: [],
          remove: replicas,
        })
      }
    }
  }

  const sweepMs = options.sweepMs === undefined ? 2_000 : options.sweepMs
  const timer = sweepMs > 0 ? setInterval(() => sweep(), sweepMs) : null
  timer?.unref?.()

  async function close() {
    if (timer) clearInterval(timer)
    redisSub?.disconnect()
    redisPub?.disconnect()
    rooms.clear()
  }

  return { publish, subscribe, since, people, setPresence, clearPresence, sweep, close, nextId }
}
