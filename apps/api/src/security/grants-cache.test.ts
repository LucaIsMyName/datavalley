import { describe, expect, it } from 'vitest'
import {
  invalidateGrantsCache,
  readGrantsCache,
  writeGrantsCache,
} from './grants-cache.js'

const subject = { kind: 'user' as const, id: 'user-1' }

describe('grants cache', () => {
  it('returns cached grants until invalidated or expired', () => {
    const grants = [{ resourceType: 'system' as const, resourceId: null, action: 'view' as const, effect: 'allow' as const }]
    writeGrantsCache(subject, grants)
    expect(readGrantsCache(subject)).toEqual(grants)
    invalidateGrantsCache(subject)
    expect(readGrantsCache(subject)).toBeNull()
  })
})
