import { describe, expect, it } from 'vitest'
import { grantPresetId, grantPresets } from './permissions.js'

describe('grant presets', () => {
  it('keeps schema changes on full edit and row edits on sales', () => {
    expect(grantPresets.full).toContain('manage_structure')
    expect(grantPresets.full).toContain('edit')
    expect(grantPresets.sales).toContain('edit')
    expect(grantPresets.sales).not.toContain('manage_structure')
    expect(grantPresets.view).toEqual(['view'])
  })

  it('reads a preset back from the actions someone has', () => {
    expect(grantPresetId(grantPresets.full)).toBe('full')
    expect(grantPresetId(grantPresets.sales)).toBe('sales')
    expect(grantPresetId(['view'])).toBe('view')
  })
})
