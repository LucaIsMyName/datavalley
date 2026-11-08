import { defaultTableDisplay } from '@datavalley/shared'
import { describe, expect, it } from 'vitest'
import { displayFromSavedView, savedViewDefinition } from './view-definition'

describe('saved view display', () => {
  it('stores the current chart setup and restores it', () => {
    const display = defaultTableDisplay()
    display.mode = 'chart'
    display.chart = { ...display.chart, type: 'line', dimensionIds: ['status'], valueIds: ['amount'], perRow: true }
    const definition = savedViewDefinition({ filter: null, sort: null, formatting: [], display })
    expect(definition.display.mode).toBe('chart')
    expect(displayFromSavedView(definition, [
      { id: 'status', type: 'status' },
      { id: 'amount', type: 'number' },
    ])?.chart.type).toBe('line')
  })

  it('leaves older views on the grid', () => {
    expect(displayFromSavedView({ filter: null }, [])).toBeNull()
  })
})