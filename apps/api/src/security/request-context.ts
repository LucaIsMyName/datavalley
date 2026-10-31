import { AsyncLocalStorage } from 'node:async_hooks'
import type { Grant } from '@datavalley/shared'

const store = new AsyncLocalStorage<{ grants: Grant[] | null }>()

/** Pass loaded grants for signed-in requests, or null when the caller is anonymous. */
export function bindRequestGrants(grants: Grant[] | null) {
  store.enterWith({ grants })
}

export function cachedGrants(): Grant[] | undefined {
  const grants = store.getStore()?.grants
  return grants ?? undefined
}
