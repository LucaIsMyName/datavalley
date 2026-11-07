import { describe, expect, it, vi } from 'vitest'
import { createPresenceReporter, mergePresence, nextPresence, emptyPresence } from './presence.js'

describe('presence report', () => {
  it('keeps a draft when the same cell is reported again without one', () => {
    const focus = { kind: 'cell' as const, tableId: 't', rowId: 'r', columnId: 'c' }
    const current = { ...emptyPresence, focus, editing: true, draft: 'Ada' }
    expect(nextPresence(current, { editing: true }).draft).toBe('Ada')
    expect(nextPresence(current, { focus: { kind: 'projectName' } }).draft).toBeNull()
  })

  it('throttles keystrokes and merges people', () => {
    vi.useFakeTimers()
    let clock = 1_000
    const sent: string[] = []
    const reporter = createPresenceReporter(
      (_projectId, body) => sent.push(body.clear ? 'clear' : body.draft ?? ''),
      () => clock,
    )
    reporter.bind('project-1')
    reporter.report({
      focus: { kind: 'cell', tableId: 't', rowId: 'r', columnId: 'c' },
      editing: true,
      draft: 'A',
      tableId: 't',
    })
    expect(sent).toEqual([])
    clock = 1_000
    vi.advanceTimersByTime(0)
    expect(sent).toEqual(['A'])
    clock = 1_050
    reporter.report({ draft: 'AB' })
    vi.advanceTimersByTime(99)
    expect(sent).toEqual(['A'])
    vi.advanceTimersByTime(1)
    expect(sent).toEqual(['A', 'AB'])
    reporter.unbind()
    expect(sent.at(-1)).toBe('clear')
    const people = mergePresence(
      [],
      [
        {
          userId: 'b',
          username: 'bea',
          color: '#2563eb',
          tableId: 't',
          tableName: 'People',
          focus: null,
          editing: false,
          draft: null,
        },
      ],
      [],
    )
    expect(mergePresence(people, [], ['b'])).toEqual([])
    vi.useRealTimers()
  })
})
