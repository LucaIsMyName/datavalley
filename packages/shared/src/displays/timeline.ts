import { dateColumnIncludesTime } from '../dates/column.js'
import { appIntlLocale, isDateRangeValue } from '../dates/format.js'
import { validateDateRangePayload } from '../dates/validate.js'

const DAY = 86_400_000

export type TimelineStep = 'month' | 'week' | 'day' | 'hour'

export type TimelineSpan = {
  start: number
  end: number
  point: boolean
}

export function timelineIncludesTime(column: { type: string; config?: Record<string, unknown> }) {
  return dateColumnIncludesTime(column)
}

export function timelineStep(zoom: number, includeTime: boolean): TimelineStep {
  const level = Math.max(1, Math.min(includeTime ? 5 : 4, Math.round(Number.isFinite(zoom) ? zoom : 1)))
  if (level <= 1) return 'month'
  if (level <= 2) return 'week'
  if (!includeTime || level <= 4) return 'day'
  return 'hour'
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function boundMs(raw: string, includeTime: boolean) {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (!includeTime) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed)
    if (!match) return null
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  }
  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

export function parseTimelineCell(value: unknown, includeTime: boolean): TimelineSpan | null {
  if (value == null || value === '') return null
  if (isDateRangeValue(value)) {
    const start = boundMs(value.from, includeTime)
    const endBound = boundMs(value.to, includeTime)
    if (start == null || endBound == null) return null
    return { start, end: includeTime ? endBound : endBound + DAY, point: false }
  }
  if (typeof value !== 'string') return null
  const start = boundMs(value, includeTime)
  if (start == null) return null
  return { start, end: start, point: true }
}

export function timelineNow(includeTime: boolean, now = new Date()) {
  if (!includeTime) return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return now.getTime()
}

export function formatTimelineBound(time: number, includeTime: boolean) {
  const date = new Date(time)
  if (!includeTime) return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function addStep(time: number, step: TimelineStep, includeTime: boolean) {
  if (!includeTime) {
    const date = new Date(time)
    if (step === 'month') return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
    if (step === 'week') return time + 7 * DAY
    return time + DAY
  }
  const date = new Date(time)
  if (step === 'month') {
    date.setDate(1)
    date.setMonth(date.getMonth() + 1)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
  }
  if (step === 'week') return time + 7 * DAY
  if (step === 'day') {
    date.setDate(date.getDate() + 1)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
  }
  return time + 3_600_000
}

function floorStep(time: number, step: TimelineStep, includeTime: boolean) {
  if (!includeTime) {
    const date = new Date(time)
    if (step === 'month') return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
    if (step === 'week') {
      const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
      const mondayOffset = (date.getUTCDay() + 6) % 7
      return midnight - mondayOffset * DAY
    }
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  }
  const date = new Date(time)
  if (step === 'month') {
    date.setDate(1)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
  }
  if (step === 'week') {
    const mondayOffset = (date.getDay() + 6) % 7
    date.setDate(date.getDate() - mondayOffset)
    date.setHours(0, 0, 0, 0)
    return date.getTime()
  }
  if (step === 'day') {
    date.setHours(0, 0, 0, 0)
    return date.getTime()
  }
  date.setMinutes(0, 0, 0)
  return date.getTime()
}

function ceilStep(time: number, step: TimelineStep, includeTime: boolean) {
  const floored = floorStep(time, step, includeTime)
  return time <= floored ? floored : addStep(floored, step, includeTime)
}

function previousStep(time: number, step: TimelineStep, includeTime: boolean) {
  if (step === 'week') return time - 7 * DAY
  if (step === 'day') return time - DAY
  if (step === 'hour') return time - 3_600_000
  if (!includeTime) {
    const date = new Date(time)
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)
  }
  const date = new Date(time)
  date.setMonth(date.getMonth() - 1)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function tickLabel(time: number, step: TimelineStep, includeTime: boolean, locale: string) {
  const intl = appIntlLocale(locale)
  const timeZone = includeTime ? undefined : 'UTC'
  if (step === 'hour') {
    return new Intl.DateTimeFormat(intl, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone }).format(time)
  }
  if (step === 'month') return new Intl.DateTimeFormat(intl, { month: 'short', year: 'numeric', timeZone }).format(time)
  return new Intl.DateTimeFormat(intl, { month: 'short', day: 'numeric', timeZone }).format(time)
}

const stepWidth: Record<TimelineStep, number> = { month: 96, week: 72, day: 40, hour: 56 }

export function timelineLayout(input: {
  spans: { start: number; end: number }[]
  now: number
  step: TimelineStep
  includeTime: boolean
  locale: string
}) {
  const points = [input.now, ...input.spans.flatMap((span) => [span.start, span.end])]
  const start = previousStep(floorStep(Math.min(...points), input.step, input.includeTime), input.step, input.includeTime)
  let end = addStep(ceilStep(Math.max(...points), input.step, input.includeTime), input.step, input.includeTime)
  if (end <= start) end = addStep(addStep(start, input.step, input.includeTime), input.step, input.includeTime)
  const ticks: { at: number; label: string }[] = []
  let cursor = start
  let guard = 0
  while (cursor < end && guard < 500) {
    ticks.push({ at: cursor, label: tickLabel(cursor, input.step, input.includeTime, input.locale) })
    const next = addStep(cursor, input.step, input.includeTime)
    if (next <= cursor) break
    cursor = next
    guard += 1
  }
  return {
    start,
    end,
    now: input.now,
    width: Math.max(ticks.length, 1) * stepWidth[input.step],
    ticks,
  }
}

export function timeAtOffset(x: number, start: number, end: number, width: number) {
  if (width <= 0 || end <= start) return start
  const ratio = Math.min(1, Math.max(0, x / width))
  return start + ratio * (end - start)
}

export function offsetAtTime(time: number, start: number, end: number, width: number) {
  if (end <= start) return 0
  return ((time - start) / (end - start)) * width
}

export function snapTimeline(time: number, step: TimelineStep, includeTime: boolean) {
  return floorStep(time, step === 'hour' ? 'hour' : 'day', includeTime && step === 'hour' ? true : includeTime)
}

export function resizeTimelineRange(input: {
  from: string
  to: string
  edge: 'start' | 'end'
  time: number
  includeTime: boolean
}) {
  const next = formatTimelineBound(input.time, input.includeTime)
  const value = input.edge === 'start' ? { from: next, to: input.to } : { from: input.from, to: next }
  const result = validateDateRangePayload(value, input.includeTime ? 'datetime' : 'date')
  return result.ok ? { ok: true as const, value: result.value } : { ok: false as const }
}

export function moveTimelineRange(input: { from: string; to: string; delta: number; includeTime: boolean }) {
  const start = boundMs(input.from, input.includeTime)
  const end = boundMs(input.to, input.includeTime)
  if (start == null || end == null || !Number.isFinite(input.delta)) return { ok: false as const }
  const value = {
    from: formatTimelineBound(start + input.delta, input.includeTime),
    to: formatTimelineBound(end + input.delta, input.includeTime),
  }
  const result = validateDateRangePayload(value, input.includeTime ? 'datetime' : 'date')
  return result.ok ? { ok: true as const, value: result.value } : { ok: false as const }
}

export function timelineWaterfallOrder(items: { start: number }[]) {
  return items
    .map((item, index) => ({ index, start: item.start }))
    .sort((left, right) => left.start - right.start || left.index - right.index)
    .map((item) => item.index)
}
