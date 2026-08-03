import type { Context } from 'hono'
import type { Bindings } from '../helpers/types'

// KV-backed distributed rate limiter for public API endpoints.
// Uses a sliding-window approximation: each IP gets a counter keyed by
// minute-prefix, with a TTL so stale keys auto-expire.
//
// Limits:
//   GET/HEAD  ? 60 req/min per IP (1 req/s average)
//   POST/PUT/DELETE ? 10 req/min per IP

const READ_LIMIT = 60
const WRITE_LIMIT = 10
const WINDOW_SECONDS = 60
const KV_TTL_SECONDS = 120

function getClientIp(c: Context<{ Bindings: Bindings }>): string {
  return String(c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown').trim()
}

function getWindowKey(ip: string): string {
  // Round to current minute for a fixed-window counter
  const now = Math.floor(Date.now() / 1000)
  const windowId = Math.floor(now / WINDOW_SECONDS)
  return `rl:${ip}:${windowId}`
}

function isReadMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
}

function isAdminPath(path: string): boolean {
  return path.startsWith('/api/admin') || path.startsWith('/api/settings')
}

export async function rateLimitMiddleware(c: Context<{ Bindings: Bindings }>, next: () => Promise<void>) {
  const kv = c.env.COURSE_SEARCH_INDEX
  if (!kv) {
    // No KV binding available ? skip rate limiting (should not happen in production)
    return await next()
  }

  const ip = getClientIp(c)
  const path = new URL(c.req.url).pathname

  // Admin and settings routes have their own rate limiting
  if (isAdminPath(path)) {
    return await next()
  }

  const method = c.req.method
  const limit = isReadMethod(method) ? READ_LIMIT : WRITE_LIMIT
  const key = getWindowKey(ip)

  try {
    const current = await kv.get(key)
    const count = current ? parseInt(current, 10) : 0

    if (count >= limit) {
      const retryAfter = WINDOW_SECONDS
      c.header('Retry-After', String(retryAfter))
      return c.json({ error: '????????????' }, 429)
    }

    // Increment counter with TTL so stale keys disappear
    await kv.put(key, String(count + 1), { expirationTtl: KV_TTL_SECONDS })
  } catch (e) {
    // KV may be temporarily unavailable ? allow the request through
    // rather than blocking legitimate traffic
    console.error('Rate limit KV error:', e)
  }

  await next()
}
