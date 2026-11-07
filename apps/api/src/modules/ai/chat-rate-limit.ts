import type { Env } from '../../config/env.js'
import { AppError } from '../../errors.js'
import type { RateLimiter } from '../../security/rate-limit.js'

const WINDOW_MS = 15 * 60 * 1000

export async function assertAiChatRateLimit(limiter: RateLimiter, env: Env, userId: string) {
  const allowed = await limiter.consume(`ai_chat:${userId}`, env.AI_CHAT_RATE_LIMIT_MAX, WINDOW_MS)
  if (!allowed) throw new AppError(429, 'rate_limited', 'AI chat rate limit exceeded')
}
