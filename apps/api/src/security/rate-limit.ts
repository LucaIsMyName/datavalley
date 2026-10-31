import { Redis } from 'ioredis'
import type { Env } from '../config/env.js'

export type RateLimiter = {
  consume(key: string, max: number, windowMs?: number): Promise<boolean>
}

class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>()

  async consume(key: string, max: number, windowMs = 60_000) {
    const now = Date.now()
    const recent = (this.hits.get(key) ?? []).filter((time) => now - time < windowMs)
    if (recent.length >= max) return false
    recent.push(now)
    this.hits.set(key, recent)
    return true
  }
}

class RedisRateLimiter implements RateLimiter {
  constructor(private redis: Redis) {}

  async consume(key: string, max: number, windowMs = 60_000) {
    const bucket = Math.floor(Date.now() / windowMs)
    const redisKey = `dv:ratelimit:${key}:${bucket}`
    const count = await this.redis.incr(redisKey)
    if (count === 1) {
      await this.redis.pexpire(redisKey, windowMs * 2)
    }
    return count <= max
  }
}

export function createRateLimiter(env: Env): RateLimiter {
  const url = env.REDIS_URL?.trim()
  if (!url) return new MemoryRateLimiter()
  const redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false })
  return new RedisRateLimiter(redis)
}
