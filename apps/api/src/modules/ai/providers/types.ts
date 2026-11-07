export type AiToolCall = { id: string; name: string; arguments: string }

export type AiChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: AiToolCall[]
  toolCallId?: string
}

export type AiToolDefinition = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type AiCompletion = {
  content: string
  toolCalls: AiToolCall[]
}

export type CompleteInput = {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
  messages: AiChatMessage[]
  tools: AiToolDefinition[]
}

export type Complete = (input: CompleteInput) => Promise<AiCompletion>
