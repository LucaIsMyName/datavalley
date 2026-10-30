export type SyncEdit<TDraft, TRecord> = {
  draft: TDraft
  delay: number
  apply: (draft: TDraft) => void
  commit: (draft: TDraft) => Promise<TRecord>
  accept: (record: TRecord) => void
  rollback: () => void
}

type Slot = {
  generation: number
  timer: ReturnType<typeof setTimeout> | null
  draft: unknown
  apply: (draft: unknown) => void
  commit: (draft: unknown) => Promise<unknown>
  accept: (record: unknown) => void
  rollback: () => void
  queued: boolean
}

type Watch = {
  generation: number
  timer: ReturnType<typeof setTimeout>
}

export function createSync() {
  const pending = new Map<string, Slot>()
  const inflight = new Map<string, Promise<void>>()
  const watches = new Map<string, Watch>()
  let generation = 0

  function edit<TDraft, TRecord>(key: string, options: SyncEdit<TDraft, TRecord>) {
    const current = pending.get(key)
    if (current?.timer) clearTimeout(current.timer)
    const next = ++generation
    options.apply(options.draft)
    const slot: Slot = {
      generation: next,
      timer: null,
      draft: options.draft,
      apply: options.apply as (draft: unknown) => void,
      commit: options.commit as (draft: unknown) => Promise<unknown>,
      accept: options.accept as (record: unknown) => void,
      rollback: options.rollback,
      queued: false,
    }
    pending.set(key, slot)
    if (options.delay > 0 && !slot.queued) {
      slot.timer = setTimeout(() => {
        slot.timer = null
        void flush(key)
      }, options.delay)
    }
  }

  function flush(key: string): Promise<void> {
    const slot = pending.get(key)
    if (!slot) return inflight.get(key) ?? Promise.resolve()
    if (slot.timer) clearTimeout(slot.timer)
    slot.timer = null
    if (slot.queued) return inflight.get(key) ?? Promise.resolve()
    slot.queued = true
    const gen = slot.generation
    const previous = inflight.get(key) ?? Promise.resolve()
    const run = previous
      .catch(() => undefined)
      .then(async () => {
        const current = pending.get(key)
        if (!current || current.generation !== gen) return
        try {
          const record = await current.commit(current.draft)
          const latest = pending.get(key)
          if (!latest || latest.generation !== gen) {
            if (latest && latest.generation > 0) {
              latest.accept(record)
              latest.apply(latest.draft)
            }
            return
          }
          latest.accept(record)
          if (pending.get(key)?.generation === gen) pending.delete(key)
        } catch (error) {
          const latest = pending.get(key)
          if (latest?.generation === gen) {
            latest.rollback()
            pending.delete(key)
          }
          throw error
        }
      })
      .finally(() => {
        if (inflight.get(key) === run) inflight.delete(key)
        const latest = pending.get(key)
        if (!latest) return
        if (latest.generation === gen) {
          latest.queued = false
          return
        }
        if (!latest.queued && latest.timer == null && latest.generation > 0) void flush(key)
      })
    inflight.set(key, run)
    return run
  }

  function cancel(key: string) {
    const slot = pending.get(key)
    if (!slot) return
    if (slot.timer) clearTimeout(slot.timer)
    slot.generation = -1
    slot.rollback()
    pending.delete(key)
  }

  function discard(key: string) {
    const slot = pending.get(key)
    if (!slot) return
    if (slot.timer) clearTimeout(slot.timer)
    slot.generation = -1
    pending.delete(key)
  }

  function watch(key: string, delay: number, run: () => void) {
    const current = watches.get(key)
    if (current) clearTimeout(current.timer)
    const next = (current?.generation ?? 0) + 1
    const timer = setTimeout(() => {
      const slot = watches.get(key)
      if (slot?.generation !== next) return
      watches.delete(key)
      run()
    }, delay)
    watches.set(key, { generation: next, timer })
  }

  return { edit, flush, cancel, discard, watch }
}

export const sync = createSync()
