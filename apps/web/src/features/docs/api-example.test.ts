import { describe, expect, it } from 'vitest'
import { tokenizeExample } from './api-example-tokens'

function typesOf(source: string) {
  return tokenizeExample(source).filter((token) => token.type !== 'text' || token.text.trim()).map((token) => [token.type, token.text])
}

describe('tokenizeExample', () => {
  it('marks keywords, strings, and numbers', () => {
    const tokens = typesOf('const result = await api.request("/widgets", { limit: 1 })')
    expect(tokens).toContainEqual(['keyword', 'const'])
    expect(tokens).toContainEqual(['keyword', 'await'])
    expect(tokens).toContainEqual(['string', '"/widgets"'])
    expect(tokens).toContainEqual(['number', '1'])
  })

  it('keeps punctuation separate from identifiers', () => {
    const tokens = typesOf('api.request<{ id: string }>()')
    expect(tokens).toContainEqual(['punctuation', '{'])
    expect(tokens).toContainEqual(['punctuation', '<'])
    expect(tokens).toContainEqual(['text', 'api'])
    expect(tokens).toContainEqual(['text', 'request'])
  })
})
