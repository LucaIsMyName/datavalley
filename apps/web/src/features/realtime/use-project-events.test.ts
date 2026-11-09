import { describe, expect, it } from 'vitest'
import { parseRealtimeEvent } from './use-project-events.js'

describe('parseRealtimeEvent', () => {
  it('reads a realtime event', () => {
    expect(parseRealtimeEvent('{"type":"rows.changed","tableId":"t"}')).toEqual({ type: 'rows.changed', tableId: 't' })
  })

  it('drops malformed or unexpected payloads instead of throwing', () => {
    expect(parseRealtimeEvent('{broken')).toBeNull()
    expect(parseRealtimeEvent('null')).toBeNull()
    expect(parseRealtimeEvent('"text"')).toBeNull()
    expect(parseRealtimeEvent('{"kind":"rows.changed"}')).toBeNull()
    expect(parseRealtimeEvent(undefined)).toBeNull()
  })
})
