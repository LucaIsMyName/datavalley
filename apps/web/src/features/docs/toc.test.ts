import { describe, expect, it } from 'vitest'
import { DOC_GUIDES, docsHash, hashHeadingId, headingId } from './toc'

describe('docs toc', () => {
  it('slugifies heading titles for hash targets', () => {
    expect(headingId('API keys')).toBe('api-keys')
    expect(headingId('Auth')).toBe('auth')
    expect(headingId('  Formula engine  ')).toBe('formula-engine')
  })

  it('keeps hash links aligned with heading ids', () => {
    expect(docsHash('formulas')).toBe('#formulas')
    expect(hashHeadingId('#formulas')).toBe('formulas')
    expect(hashHeadingId('lookup')).toBe('lookup')
  })

  it('lists the three guide routes', () => {
    expect(DOC_GUIDES.map((guide) => guide.to)).toEqual(['/doc/use', '/doc/develop', '/doc/api'])
  })
})
