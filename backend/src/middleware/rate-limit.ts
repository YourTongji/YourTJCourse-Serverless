import type { Context } from 'hono'
import type { Bindings } from '../helpers/types'

// Approximate rate limiter for public API endpoints.
// Counters live in an in-process memory map, with the Cloudflare Cache API /
// KV namespace as a best-effort distributed store on the Worker runtime.
// In the Node/VPS runtime (no-op Cache, no KV) the memory counter is the
// single source of truth — enough for a single-instance deployment.

const WINDOW_SECONDS = 60
const KV_TTL_SECONDS = 120
const MAX_STALE_WINDOWS = 3

const READ_LIMITS = [
  { prefix: '/api/courses', bucket: 'courses', limit: 60 },
  { prefix: '/api/course/by-code', bucket: 'course_by_code', limit: 60 },
  { prefix: '/api/course', bucket: 'course', limit: 120 }
]

const WRITE_LIMITS = [
  { prefix: '/api/startup', bucket: 'startup', limit: 60 },
  { prefix: '/api/findCourseByTime', bucket: 'find_course_by_time', limit: 60 }
]

// key -> count，key 形如 `rl:<bucket>:<ip>:<windowId>`
const memoryCounters = new Map<string, number>()
let lastCleanupAt = Date.now()

function getClientIp(c: Context<{ Bindings: Bindings }>): string | null {
  // 优先信任 Cloudflare 提供的头；Node/OpenResty 环境下回退到代理头。
  // X-Forwarded-For 的顺序是 `客户端 IP, 代理 IP...`，必须取第一项；
  // 取最后一项会把所有用户归并成反代自身，导致全站共享限流额度。
  const raw = c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || c.req.header('x-forwarded-for')
  if (!raw) return null
  const candidate = raw.split(',')[0]?.trim()
  if (!candidate) return null
  if (candidate.startsWith('[')) {
    const closingBracket = candidate.indexOf(']')
    if (closingBracket > 1) return candidate.slice(1, closingBracket)
  }
  const colonCount = (candidate.match(/:/g) || []).length
  return colonCount === 1 ? candidate.split(':')[0] || null : candidate
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

function incrementMemory(key: string): number {
  const now = Date.now()
  // 顺带清理已过期窗口，防止 Map 无限增长
  if (now - lastCleanupAt > WINDOW_SECONDS * 1000) {
    const oldestWindow = Math.floor(now / 1000) - WINDOW_SECONDS * MAX_STALE_WINDOWS
    for (const staleKey of memoryCounters.keys()) {
      const windowId = Number(staleKey.split(':').pop() || 0)
      if (Number.isFinite(windowId) && windowId < oldestWindow) memoryCounters.delete(staleKey)
    }
    lastCleanupAt = now
  }

  const count = (memoryCounters.get(key) || 0) + 1
  memoryCounters.set(key, count)
  return count
}

function getCacheRequest(key: string): Request {
  return new Request(`https://cache.yourtj.de/__rate_limit__/${encodeURIComponent(key)}`, { method: 'GET' })
}

// Cloudflare 运行时的分布式计数；Node 环境下 no-op 缓存会自然失败并返回 null，
// 不参与最终计数。
async function incrementDistributed(key: string): Promise<void> {
  try {
    const cache = caches.default
    const cacheRequest = getCacheRequest(key)
    let count = 0
    const cached = await cache.match(cacheRequest)
    if (cached) count = Number(await cached.text()) || 0
    await cache.put(
      cacheRequest,
      new Response(String(count + 1), {
        headers: { 'Cache-Control': `public, max-age=${KV_TTL_SECONDS}` }
      })
    )
  } catch {
    // 分布式计数不可用（例如 Node 环境），忽略
  }
}

async function incrementWithKv(kv: KVNamespace, key: string): Promise<void> {
  try {
    const current = await kv.get(key)
    const count = current ? parseInt(current, 10) : 0
    await kv.put(key, String(count + 1), { expirationTtl: KV_TTL_SECONDS })
  } catch {
    // 忽略 KV 写入失败
  }
}

export async function rateLimitMiddleware(c: Context<{ Bindings: Bindings }>, next: () => Promise<void>) {
  const path = new URL(c.req.url).pathname
  const rule = getRateLimitRule(c.req.method, path)
  if (!rule) return await next()

  const ip = getClientIp(c)
  if (!ip) return await next()

  const key = getWindowKey(ip, rule.bucket)
  const count = incrementMemory(key)

  // 尽力而为地同步到分布式存储（失败不影响本地计数）
  await incrementDistributed(key).catch(() => {})
  if (c.env.COURSE_SEARCH_INDEX) {
    await incrementWithKv(c.env.COURSE_SEARCH_INDEX, key).catch(() => {})
  }

  if (count > rule.limit) {
    c.header('Retry-After', String(getRetryAfter()))
    return c.json({ error: 'Too many requests, please retry later' }, 429)
  }

  await next()
}
