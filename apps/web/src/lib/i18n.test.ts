// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { i18n } from './i18n'

describe('i18n', () => {
  it('keeps the document language in step with the UI language', async () => {
    await i18n.changeLanguage('de')
    expect(document.documentElement.lang).toBe('de')
    await i18n.changeLanguage('en')
    expect(document.documentElement.lang).toBe('en')
  })
})
