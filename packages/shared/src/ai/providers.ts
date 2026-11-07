export const aiProviderIds = ['openai', 'anthropic', 'mistral', 'spacexai', 'ollama'] as const

export type AiProviderId = (typeof aiProviderIds)[number]

export type AiModelOption = { id: string; label: string }

export const aiProviderModels: Record<AiProviderId, AiModelOption[]> = {
  openai: [
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
    { id: 'gpt-4o', label: 'GPT-4o' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    { id: 'claude-opus-4-1', label: 'Claude Opus 4.1' },
  ],
  mistral: [
    { id: 'mistral-large-latest', label: 'Mistral Large' },
    { id: 'mistral-small-latest', label: 'Mistral Small' },
    { id: 'open-mistral-nemo', label: 'Mistral Nemo' },
  ],
  spacexai: [
    { id: 'grok-4.7', label: 'Grok 4.7' },
    { id: 'grok-4', label: 'Grok 4' },
    { id: 'grok-3', label: 'Grok 3' },
  ],
  ollama: [],
}

export const aiProviderDefaults: Record<AiProviderId, { baseUrl: string; apiKeyRequired: boolean }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', apiKeyRequired: true },
  anthropic: { baseUrl: 'https://api.anthropic.com', apiKeyRequired: true },
  mistral: { baseUrl: 'https://api.mistral.ai/v1', apiKeyRequired: true },
  spacexai: { baseUrl: 'https://api.x.ai/v1', apiKeyRequired: true },
  ollama: { baseUrl: 'http://127.0.0.1:11434', apiKeyRequired: false },
}

export function isAiProviderId(value: string): value is AiProviderId {
  return (aiProviderIds as readonly string[]).includes(value)
}
