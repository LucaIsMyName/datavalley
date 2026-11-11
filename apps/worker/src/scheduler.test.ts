import { describe, expect, it, vi } from 'vitest'
import { enqueueScheduledConnector, presetBucket, scheduleClaimKey, type ScheduleClaimActions } from './scheduler.js'

function claimMemory() {
  const keys = new Set<string>()
  const actions: ScheduleClaimActions = {
    claim: async (key) => {
      if (keys.has(key)) return false
      keys.add(key)
      return true
    },
    release: async (key) => {
      keys.delete(key)
    },
    insertSync: async () => ({ id: 'sync-1' }),
    enqueue: async () => undefined,
  }
  return { keys, actions }
}

describe('connector schedule buckets', () => {
  it('keeps one weekly bucket across a month boundary', () => {
    const sunday = presetBucket('weekly', new Date('2026-11-01T10:00:00Z'))
    const monday = presetBucket('weekly', new Date('2026-11-02T10:00:00Z'))
    const nextSunday = presetBucket('weekly', new Date('2026-11-08T23:59:00Z'))
    expect(monday).toBe(nextSunday)
    expect(sunday).not.toBe(monday)
    expect(presetBucket('weekly', new Date('2026-10-28T00:00:00Z'))).toBe(sunday)
  })

  it('assigns the first days of January to the ISO week of the previous year when needed', () => {
    expect(presetBucket('weekly', new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53')
    expect(presetBucket('weekly', new Date('2027-01-04T12:00:00Z'))).toBe('2027-W1')
  })

  it('releases the claim when enqueue throws', async () => {
    const { keys, actions } = claimMemory()
    actions.enqueue = async () => {
      throw new Error('queue down')
    }
    const connector = { id: 'connector-1', schedule: { preset: 'daily' } }
    const now = new Date('2026-11-09T10:00:00Z')
    await expect(enqueueScheduledConnector(connector, actions, now)).rejects.toThrow('queue down')
    expect(keys.has(scheduleClaimKey(connector.id, presetBucket('daily', now)))).toBe(false)
  })

  it('releases the claim when the sync row insert throws', async () => {
    const { keys, actions } = claimMemory()
    const enqueue = vi.fn(actions.enqueue)
    actions.enqueue = enqueue
    actions.insertSync = async () => {
      throw new Error('insert failed')
    }
    const connector = { id: 'connector-1', schedule: { preset: 'hourly' } }
    const now = new Date('2026-11-09T10:00:00Z')
    await expect(enqueueScheduledConnector(connector, actions, now)).rejects.toThrow('insert failed')
    expect(enqueue).not.toHaveBeenCalled()
    expect(keys.has(scheduleClaimKey(connector.id, presetBucket('hourly', now)))).toBe(false)
  })

  it('keeps the claim after a successful enqueue and skips the next pass', async () => {
    const { keys, actions } = claimMemory()
    const enqueue = vi.fn(actions.enqueue)
    actions.enqueue = enqueue
    const connector = { id: 'connector-1', schedule: { preset: 'daily' } }
    const now = new Date('2026-11-09T10:00:00Z')
    await enqueueScheduledConnector(connector, actions, now)
    await enqueueScheduledConnector(connector, actions, now)
    expect(enqueue).toHaveBeenCalledTimes(1)
    expect(keys.has(scheduleClaimKey(connector.id, presetBucket('daily', now)))).toBe(true)
  })

  it('does not insert or enqueue when the claim is already held', async () => {
    const { keys, actions } = claimMemory()
    const now = new Date('2026-11-09T10:00:00Z')
    const connector = { id: 'connector-1', schedule: { preset: 'weekly' } }
    keys.add(scheduleClaimKey(connector.id, presetBucket('weekly', now)))
    const insertSync = vi.fn(actions.insertSync)
    const enqueue = vi.fn(actions.enqueue)
    actions.insertSync = insertSync
    actions.enqueue = enqueue
    await enqueueScheduledConnector(connector, actions, now)
    expect(insertSync).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('changes the daily and hourly buckets at UTC boundaries', () => {
    expect(presetBucket('daily', new Date('2026-11-09T23:59:00Z'))).not.toBe(presetBucket('daily', new Date('2026-11-10T00:00:00Z')))
    expect(presetBucket('hourly', new Date('2026-11-09T10:00:00Z'))).toBe(presetBucket('hourly', new Date('2026-11-09T10:59:59Z')))
    expect(presetBucket('manual')).toBe('')
  })
})
