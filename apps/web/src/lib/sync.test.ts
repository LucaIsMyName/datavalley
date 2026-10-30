import { describe, expect, it, vi } from 'vitest'
import { createSync } from './sync.js'

describe('sync engine', () => {
  it('applies immediately and commits once after the pause', async () => {
    vi.useFakeTimers()
    const engine = createSync()
    const commits: string[] = []
    const seen: string[] = []
    engine.edit('cell', {
      draft: 'A',
      delay: 300,
      apply: (draft) => seen.push(draft),
      commit: async (draft) => {
        commits.push(draft)
        return { version: 2, value: draft }
      },
      accept: () => seen.push('accepted'),
      rollback: () => seen.push('rolled'),
    })
    engine.edit('cell', {
      draft: 'AB',
      delay: 300,
      apply: (draft) => seen.push(draft),
      commit: async (draft) => {
        commits.push(draft)
        return { version: 2, value: draft }
      },
      accept: () => seen.push('accepted'),
      rollback: () => seen.push('rolled'),
    })
    expect(seen).toEqual(['A', 'AB'])
    expect(commits).toEqual([])
    await vi.advanceTimersByTimeAsync(300)
    expect(commits).toEqual(['AB'])
    expect(seen).toContain('accepted')
    vi.useRealTimers()
  })

  it('keeps a newer draft when an older save returns', async () => {
    const engine = createSync()
    let release: (value: { version: number }) => void = () => {}
    let started: () => void = () => {}
    const startedPromise = new Promise<void>((resolve) => { started = resolve })
    const accepted: number[] = []
    const applied: string[] = []
    engine.edit('cell', {
      draft: 'A',
      delay: 0,
      apply: (draft) => applied.push(draft),
      commit: () => {
        started()
        return new Promise<{ version: number }>((resolve) => { release = resolve })
      },
      accept: (record: { version: number }) => accepted.push(record.version),
      rollback: () => applied.push('rolled'),
    })
    const first = engine.flush('cell')
    await startedPromise
    engine.edit('cell', {
      draft: 'AB',
      delay: 0,
      apply: (draft) => applied.push(draft),
      commit: async () => ({ version: 3 }),
      accept: (record: { version: number }) => accepted.push(record.version),
      rollback: () => applied.push('rolled'),
    })
    release({ version: 2 })
    await first
    await engine.flush('cell')
    expect(applied).toEqual(['A', 'AB', 'AB'])
    expect(accepted).toEqual([2, 3])
  })

  it('rolls back a failed commit and keeps a newer edit', async () => {
    const engine = createSync()
    const applied: string[] = []
    engine.edit('name', {
      draft: 'Bad',
      delay: 0,
      apply: (draft) => applied.push(draft),
      commit: async () => { throw new Error('nope') },
      accept: () => applied.push('accepted'),
      rollback: () => applied.push('rolled'),
    })
    await expect(engine.flush('name')).rejects.toThrow('nope')
    expect(applied).toEqual(['Bad', 'rolled'])
  })

  it('commits a text draft when apply leaves the cache alone', async () => {
    const engine = createSync()
    const commits: string[] = []
    let stored = 'before'
    engine.edit('cell', {
      draft: 'after',
      delay: 0,
      apply: () => undefined,
      commit: async (draft) => {
        commits.push(draft)
        return { version: 2, value: draft }
      },
      accept: (record: { value: string }) => { stored = record.value },
      rollback: () => { stored = 'before' },
    })
    await engine.flush('cell')
    expect(commits).toEqual(['after'])
    expect(stored).toBe('after')
  })

  it('drops a pending edit without rolling it back', async () => {
    vi.useFakeTimers()
    const engine = createSync()
    const seen: string[] = []
    engine.edit('cell', {
      draft: 'A',
      delay: 300,
      apply: () => seen.push('apply'),
      commit: async () => {
        seen.push('commit')
        return {}
      },
      accept: () => seen.push('accept'),
      rollback: () => seen.push('rollback'),
    })
    engine.discard('cell')
    await vi.advanceTimersByTimeAsync(300)
    expect(seen).toEqual(['apply'])
    vi.useRealTimers()
  })

  it('runs a watched read once after the pause', async () => {
    vi.useFakeTimers()
    const engine = createSync()
    const runs: string[] = []
    engine.watch('filter', 300, () => runs.push('a'))
    engine.watch('filter', 300, () => runs.push('b'))
    await vi.advanceTimersByTimeAsync(299)
    expect(runs).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(runs).toEqual(['b'])
    vi.useRealTimers()
  })
})
