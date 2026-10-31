import { describe, expect, it } from 'vitest'
import { formatDocumentTitle, titleSegmentsFromCrumbs } from './document-title'

describe('formatDocumentTitle', () => {
  it('returns app name when segments are empty', () => {
    expect(formatDocumentTitle([], 'Datavalley')).toBe('Datavalley')
  })

  it('skips ellipsis placeholders', () => {
    expect(formatDocumentTitle(['…', 'Acme'], 'Datavalley')).toBe('Acme · Datavalley')
  })

  it('joins segments before the app name', () => {
    expect(formatDocumentTitle(['Invoices', 'Acme'], 'Datavalley')).toBe('Invoices · Acme · Datavalley')
  })
})

describe('titleSegmentsFromCrumbs', () => {
  it('uses the last crumb for a single-level page', () => {
    expect(titleSegmentsFromCrumbs([{ label: 'Dashboard' }])).toEqual(['Dashboard'])
  })

  it('uses the page label for settings', () => {
    expect(
      titleSegmentsFromCrumbs([
        { label: 'Settings', to: '/settings/profile' },
        { label: 'Users' },
      ]),
    ).toEqual(['Users'])
  })

  it('uses table then project for a project table route', () => {
    expect(
      titleSegmentsFromCrumbs([
        { label: 'Projects', to: '/projects' },
        { label: 'Acme' },
        { label: 'Invoices' },
      ]),
    ).toEqual(['Invoices', 'Acme'])
  })
})
