import type { Bindings } from '../helpers/types'

// Simple in-memory rate limiter (per-isolate; reset on cold start)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 20

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) return false
  entry.count++
  return true
}

export async function adminAuthMiddleware(c: any, next: any) {
  // 先限流再校验密钥，避免错误密钥请求无限探测。
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown'
  if (!checkRateLimit(ip)) {
    return c.json({ error: 'Too many requests' }, 429)
  }

  const input = c.req.header('x-admin-secret')
  if (!input || input !== c.env.ADMIN_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
}
