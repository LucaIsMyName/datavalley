import { describe, expect, it } from 'vitest'
import { recentTitleParts } from './format'

describe('recentTitleParts', () => {
  it('splits project and table names for table recents', () => {
    expect(
      recentTitleParts({
        resourceType: 'table',
        title: 'Invoices',
        subtitle: 'Library',
      }),
    ).toEqual({ prefix: 'Library', title: 'Invoices' })
  })

  it('keeps the project title alone', () => {
    expect(
      recentTitleParts({
        resourceType: 'project',
        title: 'Library',
      }),
    ).toEqual({ title: 'Library' })
  })
})
