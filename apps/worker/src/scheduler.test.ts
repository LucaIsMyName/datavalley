import { describe, expect, it } from 'vitest'
import { presetBucket } from './scheduler.js'

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

  it('changes the daily and hourly buckets at UTC boundaries', () => {
    expect(presetBucket('daily', new Date('2026-11-09T23:59:00Z'))).not.toBe(presetBucket('daily', new Date('2026-11-10T00:00:00Z')))
    expect(presetBucket('hourly', new Date('2026-11-09T10:00:00Z'))).toBe(presetBucket('hourly', new Date('2026-11-09T10:59:59Z')))
    expect(presetBucket('manual')).toBe('')
  })
})
