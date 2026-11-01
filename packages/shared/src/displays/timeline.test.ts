import { describe, expect, it } from 'vitest'
import {
  formatTimelineBound,
  growTimelineWindow,
  moveTimelineRange,
  parseTimelineCell,
  resizeTimelineRange,
  snapTimeline,
  timeAtOffset,
  timelineLayout,
  timelineNow,
  timelineStep,
  timelineWaterfallOrder,
  timelineWindow,
} from './timeline.js'

describe('timeline placement', () => {
  it('places a date range across its days and keeps a single date as a point', () => {
    expect(parseTimelineCell({ from: '2026-03-04', to: '2026-03-06' }, false)).toEqual({
      start: Date.UTC(2026, 2, 4),
      end: Date.UTC(2026, 2, 7),
      point: false,
    })
    expect(parseTimelineCell('2026-03-04', false)).toEqual({
      start: Date.UTC(2026, 2, 4),
      end: Date.UTC(2026, 2, 4),
      point: true,
    })
    expect(parseTimelineCell(null, false)).toBeNull()
    expect(parseTimelineCell('', false)).toBeNull()
  })

  it('gives every item its own row and moves a row up when its start becomes earlier', () => {
    expect(timelineWaterfallOrder([{ start: 10 }, { start: 20 }, { start: 5 }])).toEqual([2, 0, 1])
    expect(timelineWaterfallOrder([{ start: 10 }, { start: 1 }, { start: 5 }])).toEqual([1, 2, 0])
  })

  it('places the now line at the start of today for a date column', () => {
    expect(timelineNow(false, new Date(2026, 2, 4, 15, 30))).toBe(Date.UTC(2026, 2, 4))
    expect(timelineNow(true, new Date(2026, 2, 4, 15, 30))).toBe(new Date(2026, 2, 4, 15, 30).getTime())
  })
})

describe('timeline zoom and snap', () => {
  it('uses months when zoomed out, hours only when the column stores time, and dates otherwise', () => {
    expect(timelineStep(1, false)).toBe('month')
    expect(timelineStep(5, false)).toBe('day')
    expect(timelineStep(5, true)).toBe('hour')
    const coarse = timelineLayout({
      spans: [{ start: Date.UTC(2026, 2, 4), end: Date.UTC(2026, 2, 10) }],
      now: Date.UTC(2026, 2, 4),
      step: 'month',
      includeTime: false,
      locale: 'en',
    })
    expect(coarse.ticks.every((tick) => !tick.label.includes(':'))).toBe(true)
    expect(coarse.ticks.some((tick) => tick.label.includes('2026'))).toBe(true)
    const hours = timelineLayout({
      spans: [],
      now: Date.UTC(2026, 2, 4, 10),
      step: 'hour',
      includeTime: true,
      locale: 'en',
    })
    expect(hours.ticks.some((tick) => /\d:\d\d/.test(tick.label))).toBe(true)
  })

  it('snaps a drag to the day, or to the hour when zoom is high', () => {
    expect(snapTimeline(Date.UTC(2026, 2, 4, 15, 40), 'day', false)).toBe(Date.UTC(2026, 2, 4))
    const hour = new Date(2026, 2, 4, 15, 40).getTime()
    expect(snapTimeline(hour, 'hour', true)).toBe(new Date(2026, 2, 4, 15, 0).getTime())
    expect(formatTimelineBound(Date.UTC(2026, 2, 4), false)).toBe('2026-03-04')
  })

  it('moves a range by the same amount on both ends', () => {
    const day = 86_400_000
    expect(moveTimelineRange({ from: '2026-03-04', to: '2026-03-06', delta: 2 * day, includeTime: false })).toEqual({
      ok: true,
      value: { from: '2026-03-06', to: '2026-03-08' },
    })
    const from = formatTimelineBound(new Date(2026, 2, 4, 10).getTime(), true)
    const to = formatTimelineBound(new Date(2026, 2, 4, 12).getTime(), true)
    expect(moveTimelineRange({ from, to, delta: 3_600_000, includeTime: true })).toEqual({
      ok: true,
      value: {
        from: formatTimelineBound(new Date(2026, 2, 4, 11).getTime(), true),
        to: formatTimelineBound(new Date(2026, 2, 4, 13).getTime(), true),
      },
    })
  })

  it('extends the window earlier or later without moving the visible instant', () => {
    const points = [Date.UTC(2026, 10, 3), Date.UTC(2026, 10, 11)]
    const window = timelineWindow({ points, step: 'day', includeTime: false })
    expect(window.start).toBeLessThanOrEqual(Date.UTC(2026, 9, 3))
    expect(window.end).toBeGreaterThanOrEqual(Date.UTC(2026, 11, 11))
    const layout = timelineLayout({
      spans: [{ start: points[0], end: points[1] }],
      now: points[0],
      step: 'day',
      includeTime: false,
      locale: 'en',
      start: window.start,
      end: window.end,
    })
    const scrollLeft = 80
    const visible = timeAtOffset(scrollLeft + 100, layout.start, layout.end, layout.width)
    const earlier = growTimelineWindow({
      start: layout.start,
      end: layout.end,
      step: 'day',
      includeTime: false,
      edge: 'start',
      scrollLeft,
    })
    expect(earlier.start).toBeLessThan(layout.start)
    expect(timeAtOffset(earlier.scrollLeft + 100, earlier.start, earlier.end, layout.width + earlier.added)).toBe(visible)
    const later = growTimelineWindow({
      start: layout.start,
      end: layout.end,
      step: 'day',
      includeTime: false,
      edge: 'end',
      scrollLeft,
    })
    expect(later.end).toBeGreaterThan(layout.end)
    expect(later.scrollLeft).toBe(scrollLeft)
    expect(timeAtOffset(later.scrollLeft + 100, later.start, later.end, layout.width + later.added)).toBe(visible)
  })

  it('refuses a range whose end moves before its start and allows the same day', () => {
    expect(resizeTimelineRange({ from: '2026-03-04', to: '2026-03-06', edge: 'end', time: Date.UTC(2026, 2, 1), includeTime: false }).ok).toBe(false)
    expect(resizeTimelineRange({ from: '2026-03-04', to: '2026-03-06', edge: 'end', time: Date.UTC(2026, 2, 4), includeTime: false })).toEqual({
      ok: true,
      value: { from: '2026-03-04', to: '2026-03-04' },
    })
    expect(resizeTimelineRange({ from: '2026-03-04', to: '2026-03-06', edge: 'start', time: Date.UTC(2026, 2, 5), includeTime: false })).toEqual({
      ok: true,
      value: { from: '2026-03-05', to: '2026-03-06' },
    })
  })
})
