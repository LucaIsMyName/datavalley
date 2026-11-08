import { describe, expect, it } from 'vitest'
import { applyMailPlaceholders } from './mail.js'

describe('applyMailPlaceholders', () => {
  it('fills column names and leaves unknown tokens', () => {
    const text = applyMailPlaceholders('Hello {{Name}}, about {{ Person }} and {{Missing}}', {
      Name: 'Website',
      Person: 'Ada Lovelace',
    })
    expect(text).toBe('Hello Website, about Ada Lovelace and {{Missing}}')
  })
})
