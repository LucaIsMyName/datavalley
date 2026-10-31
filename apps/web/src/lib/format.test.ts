import { describe, expect, it } from 'vitest'
import { formatRecentTitle } from './format'

describe('formatRecentTitle', () => {
  it('joins project and table names for table recents', () => {
    expect(
      formatRecentTitle({
        resourceType: 'table',
        title: 'Invoices',
        subtitle: 'Library',
      }),
    ).toBe('Library > Invoices')
  })

  it('keeps the project title alone', () => {
    expect(
      formatRecentTitle({
        resourceType: 'project',
        title: 'Library',
      }),
    ).toBe('Library')
  })
})
