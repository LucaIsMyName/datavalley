import { describe, expect, it } from 'vitest'
import { aiProviderDefaults, aiProviderModels } from './providers.js'

describe('ai providers', () => {
  it('lists Grok 4.7 first for SpaceXAI and keeps Ollama on localhost', () => {
    expect(aiProviderModels.spacexai[0]?.id).toBe('grok-4.7')
    expect(aiProviderDefaults.spacexai.baseUrl).toBe('https://api.x.ai/v1')
    expect(aiProviderDefaults.ollama.baseUrl).toBe('http://127.0.0.1:11434')
    expect(aiProviderDefaults.ollama.apiKeyRequired).toBe(false)
    expect(aiProviderDefaults.openai.apiKeyRequired).toBe(true)
  })
})
