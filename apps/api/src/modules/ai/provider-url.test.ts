import { describe, expect, it } from 'vitest'
import { assertAiProviderBaseUrl } from './provider-url.js'

describe('assertAiProviderBaseUrl', () => {
  it('allows localhost for ollama', async () => {
    await expect(assertAiProviderBaseUrl('ollama', 'http://127.0.0.1:11434')).resolves.toBeUndefined()
  })

  it('rejects private hosts for ollama', async () => {
    await expect(assertAiProviderBaseUrl('ollama', 'http://10.0.0.1:11434')).rejects.toMatchObject({
      status: 400,
    })
  })

  it('rejects private hosts for remote providers', async () => {
    await expect(assertAiProviderBaseUrl('openai', 'http://127.0.0.1:1234')).rejects.toMatchObject({
      status: 400,
    })
  })
})
