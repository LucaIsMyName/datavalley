import { describe, expect, it } from 'vitest'
import { DEFAULT_PROJECT_ICON, DEFAULT_TABLE_ICON, isResourceIcon } from './resource-icons.js'

describe('resource icons', () => {
  it('accepts the defaults and rejects unknown names', () => {
    expect(isResourceIcon(DEFAULT_PROJECT_ICON)).toBe(true)
    expect(isResourceIcon(DEFAULT_TABLE_ICON)).toBe(true)
    expect(isResourceIcon('NotAnIcon')).toBe(false)
  })
})
