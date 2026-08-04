import type { Context } from 'hono'
import type { Bindings } from '../helpers/types'

// Distributed approximate rate limiter for public API endpoints.
// Counters are stored in the default Cache API first, with the existing
// COURSE_SEARCH_INDEX KV namespace as a fallback. Cache/KV read-modify-write
// is not atomic, so heavy concurrent traffic may be slightly undercounted;
// read-path writes are disabled separately to stop the main amplification.

const WINDOW_SECONDS = 60
const KV_TTL_SECONDS = 120

const READ_LIMITS = [
  { prefix: '/api/courses', bucket: 'courses', limit: 60 },
  { prefix: '/api/course/by-code', bucket: 'course_by_code', limit: 60 },
  { prefix: '/api/course', bucket: 'course', limit: 120 }
]

const WRITE_LIMITS = [
  { prefix: '/api/startup', bucket: 'startup', limit: 60 },
  { prefix: '/api/findCourseByTime', bucket: 'find_course_by_time', limit: 60 }
]

function getClientIp(c: Context<{ Bindings: Bindings }>): string | null {
  // Only trust the Cloudflare-provided header. x-forwarded-for is client
  // controllable and would let attackers spoof their identity entirely.
  const raw = c.req.header('cf-connecting-ip')
  if (!raw) return null
  return raw.split(',')[0].trim() || null
}

function isBypassPath(path: string): boolean {
  return (
    path.startsWith('/api/admin') ||
    path.startsWith('/api/settings') ||
    path.startsWith('/api/health')
  )
}

function getRateLimitRule(method: string, path: string) {
  if (isBypassPath(path)) return null
  if (method === 'OPTIONS') return null

  if (method === 'GET' || method === 'HEAD') {
    for (const rule of READ_LIMITS) {
      if (path.startsWith(rule.prefix)) return rule
    }
    return { prefix: '/api', bucket: 'read', limit: 300 }
  }

  for (const rule of WRITE_LIMITS) {
    if (path.startsWith(rule.prefix)) return rule
  }
  return { prefix: '/api', bucket: 'write', limit: 30 }
}

function getWindowKey(ip: string, bucket: string): string {
  const now = Math.floor(Date.now() / 1000)
  const windowId = Math.floor(now / WINDOW_SECONDS)
  return `rl:${bucket}:${ip}:${windowId}`
}

function getRetryAfter(): number {
  const now = Math.floor(Date.now() / 1000)
  return Math.max(1, WINDOW_SECONDS - (now % WINDOW_SECONDS))
}

function getCacheRequest(key: string): Request {
  return new Request(`https://cache.yourtj.de/__rate_limit__/${encodeURIComponent(key)}`, { method: 'GET' })
}

async function incrementWithCache(key: string): Promise<number | null> {
  const cache = caches.default
  const cacheRequest = getCacheRequest(key)

  let count = 0
  try {
    const cached = await cache.match(cacheRequest)
    if (cached) count = Number(await cached.text()) || 0
  } catch {
    return null
  }

  try {
    await cache.put(
      cacheRequest,
      new Response(String(count + 1), {
        headers: {
          'Cache-Control': `public, max-age=${KV_TTL_SECONDS}`
        }
      })
    )
  } catch {
    return null
  }

  return count + 1
}

async function incrementWithKv(
  kv: KVNamespace,
  key: string
): Promise<number | null> {
  try {
    const current = await kv.get(key)
    const count = current ? parseInt(current, 10) : 0
    await kv.put(key, String(count + 1), { expirationTtl: KV_TTL_SECONDS })
    return count + 1
  } catch {
    return null
  }
}

export async function rateLimitMiddleware(c: Context<{ Bindings: Bindings }>, next: () => Promise<void>) {
  const path = new URL(c.req.url).pathname
  const rule = getRateLimitRule(c.req.method, path)
  if (!rule) return await next()

  const ip = getClientIp(c)
  if (!ip) return await next()

  const key = getWindowKey(ip, rule.bucket)
  const count = (await incrementWithCache(key)) ?? (c.env.COURSE_SEARCH_INDEX ? await incrementWithKv(c.env.COURSE_SEARCH_INDEX, key) : null)

  if (count === null) return await next()

  if (count > rule.limit) {
    c.header('Retry-After', String(getRetryAfter()))
    return c.json({ error: 'Too many requests, please retry later' }, 429)
  }

  await next()
}
